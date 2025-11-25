import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { execFile } from 'child_process';

const EMU_PER_PIXEL = 9525; // 914400 / 96

interface Block {
    type: string;
    props: any;
}

interface Page {
    title: string;
    blocks: Block[];
    bgColor?: string;
}

interface Template {
    name: string;
    pages: Page[];
}

export class PptxImporter {
    private zip: JSZip;
    private uploadDir: string;
    private baseUrl: string;

    constructor(uploadDir: string, baseUrl: string = '') {
        this.zip = new JSZip();
        this.uploadDir = uploadDir;
        this.baseUrl = baseUrl;
    }

    async parse(buffer: Buffer): Promise<Template> {
        this.zip = await JSZip.loadAsync(buffer);

        // 1. Get Presentation Size
        const presentationXml = await this.zip.file('ppt/presentation.xml')?.async('text');
        if (!presentationXml) throw new Error('Invalid PPTX: missing presentation.xml');

        const presentation = await parseStringPromise(presentationXml);
        const sldSz = presentation['p:presentation']['p:sldSz'][0]['$'];
        const pptWidth = parseInt(sldSz.cx);
        const pptHeight = parseInt(sldSz.cy);

        // Target width is 800 (from TemplateBuilder.tsx)
        const targetWidth = 800;
        const scaleFactor = targetWidth / (pptWidth / EMU_PER_PIXEL);

        // 2. Get Slides
        const sldIdLst = presentation['p:presentation']['p:sldIdLst']?.[0]?.['p:sldId'];
        if (!sldIdLst) return { name: 'Imported PPTX', pages: [] };

        // We need to map r:id to filename.
        const relsXml = await this.zip.file('ppt/_rels/presentation.xml.rels')?.async('text');
        const relMap: Record<string, string> = {};

        if (relsXml) {
            const rels = await parseStringPromise(relsXml);
            const relationships = rels.Relationships?.Relationship || [];
            relationships.forEach((r: any) => {
                if (r['$'] && r['$'].Id && r['$'].Target) {
                    relMap[r['$'].Id] = r['$'].Target;
                }
            });
        }

        const sortedSlideFiles = sldIdLst.map((sld: any) => {
            const rId = sld['$']['r:id'];
            const target = relMap[rId];
            return target ? target.replace('slides/', '') : null;
        }).filter((f: string | null) => f !== null) as string[];

        const pages: Page[] = [];

        for (const slideFile of sortedSlideFiles) {
            const page = await this.processSlide(slideFile, scaleFactor);
            pages.push(page);
        }

        return {
            name: 'Imported PPTX',
            pages
        };
    }

    private async processSlide(filename: string, scale: number): Promise<Page> {
        const xmlContent = await this.zip.file(`ppt/slides/${filename}`)?.async('text');
        if (!xmlContent) return { title: filename, blocks: [] };

        const slide = await parseStringPromise(xmlContent);
        const blocks: Block[] = [];

        // Load relationships for this slide (images)
        const relsFilename = `ppt/slides/_rels/${filename}.rels`;
        const relsContent = await this.zip.file(relsFilename)?.async('text');
        const relMap: Record<string, string> = {};
        if (relsContent) {
            const rels = await parseStringPromise(relsContent);
            const relationships = rels.Relationships?.Relationship || [];
            relationships.forEach((r: any) => {
                if (r['$'] && r['$'].Id && r['$'].Target) {
                    relMap[r['$'].Id] = r['$'].Target;
                }
            });
        }

        const spTree = slide['p:sld']['p:cSld'][0]['p:spTree'][0];

        // Iterate shapes
        const shapes = spTree['p:sp'] || [];
        for (const sp of shapes) {
            const arr = await this.extractBlocksFromShape(sp, scale, { x: 0, y: 0 });
            for (const b of arr) blocks.push(b);
        }

        // Iterate pictures
        const pics = spTree['p:pic'] || [];
        for (const pic of pics) {
            const block = await this.processPicture(pic, scale, relMap);
            if (block) blocks.push(block);
        }
        // Connectors (lines/arrows)
        const conns = spTree['p:cxnSp'] || [];
        for (const cxn of conns) {
            const arr = await this.extractBlocksFromShape({ p: { }, 'p:spPr': cxn['p:spPr'] }, scale, { x: 0, y: 0 });
            for (const b of arr) blocks.push(b);
        }

        // Iterate groups recursively
        const groups = spTree['p:grpSp'] || [];
        for (const grp of groups) {
            const gBlocks = await this.processGroup(grp, scale, relMap, { x: 0, y: 0 });
            for (const b of gBlocks) blocks.push(b);
        }

        const gfs = spTree['p:graphicFrame'] || [];
        for (const gf of gfs) {
            const b = await this.processGraphicFrame(gf, scale, { x: 0, y: 0 });
            if (b) blocks.push(b);
        }

        return {
            title: `Slide ${filename.replace('slide', '').replace('.xml', '')}`,
            blocks
        };
    }

    private getTransform(sp: any, scale: number, parentOffset?: { x: number, y: number }) {
        const xfrm = (sp['p:spPr']?.[0]?.['a:xfrm']?.[0]) || (sp['p:grpSpPr']?.[0]?.['a:xfrm']?.[0]);
        const off = xfrm['a:off'][0]['$'];
        const ext = xfrm['a:ext'][0]['$'];
        const px = (parseInt(off.x) / EMU_PER_PIXEL) * scale;
        const py = (parseInt(off.y) / EMU_PER_PIXEL) * scale;
        const x = px + (parentOffset?.x || 0);
        const y = py + (parentOffset?.y || 0);
        const width = (parseInt(ext.cx) / EMU_PER_PIXEL) * scale;
        const height = (parseInt(ext.cy) / EMU_PER_PIXEL) * scale;

        return { x, y, width, height };
    }

    private getTransformGraphic(gf: any, scale: number, parentOffset?: { x: number, y: number }) {
        const xfrm = gf['p:xfrm']?.[0];
        const off = xfrm['a:off'][0]['$'];
        const ext = xfrm['a:ext'][0]['$'];
        const px = (parseInt(off.x) / EMU_PER_PIXEL) * scale;
        const py = (parseInt(off.y) / EMU_PER_PIXEL) * scale;
        const x = px + (parentOffset?.x || 0);
        const y = py + (parentOffset?.y || 0);
        const width = (parseInt(ext.cx) / EMU_PER_PIXEL) * scale;
        const height = (parseInt(ext.cy) / EMU_PER_PIXEL) * scale;
        return { x, y, width, height };
    }

    private async extractBlocksFromShape(sp: any, scale: number, parentOffset: { x: number, y: number }): Promise<Block[]> {
        try {
            const txBody = sp['p:txBody'];
            const blocks: Block[] = [];

            const paragraphs = txBody[0]['a:p'];
            let fullText = '';
            let fontSize = 12;
            let color = '#000000';
            let foundSize = false;
            let foundColor = false;

            for (const p of paragraphs) {
                const runs = p['a:r'];
                if (runs) {
                    for (const r of runs) {
                        const t = r['a:t']?.[0];
                        if (t) {
                            fullText += t;

                            if (r['a:rPr']) {
                                const rPr = r['a:rPr'][0];

                                if (!foundSize && rPr['$'] && rPr['$'].sz) {
                                    fontSize = (parseInt(rPr['$'].sz) / 100) * (96 / 72);
                                    foundSize = true;
                                }

                                if (!foundColor && rPr['a:solidFill']) {
                                    const solidFill = rPr['a:solidFill'][0];
                                    if (solidFill['a:srgbClr']) {
                                        color = '#' + solidFill['a:srgbClr'][0]['$'].val;
                                        foundColor = true;
                                    } else if (solidFill['a:schemeClr']) {
                                        const scheme = solidFill['a:schemeClr'][0]['$'].val;
                                        if (['tx1', 'dk1', 'dk2'].includes(scheme)) {
                                            color = '#000000';
                                            foundColor = true;
                                        } else if (['tx2', 'lt1', 'lt2', 'bg1'].includes(scheme)) {
                                            color = '#ffffff';
                                            foundColor = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                fullText += '\n';
            }

            fullText = fullText.trim();
            {
                const spPr = sp['p:spPr']?.[0];
                const prst = spPr?.['a:prstGeom']?.[0]?.['$']?.prst;
                const { x, y, width, height } = this.getTransform(sp, scale, parentOffset);
                const fillColor = this.getFillColor(spPr);
                const strokeColor = this.getStrokeColor(spPr);
                const strokeWidth = this.getStrokeWidth(spPr);
                if (prst === 'rect' || prst === 'roundRect') {
                    blocks.push({ type: 'rect', props: { x, y, width, height, color: fillColor ?? 'transparent', stroke: strokeColor, strokeWidth } });
                }
                if (prst === 'ellipse') {
                    const r = Math.min(width, height) / 2;
                    blocks.push({ type: 'circle', props: { x, y, radius: r, color: fillColor ?? 'transparent', stroke: strokeColor, strokeWidth } });
                }
                if (prst === 'line' || prst === 'straightConnector1') {
                    const x2 = width;
                    const y2 = height;
                    blocks.push({ type: 'line', props: { x, y, x2, y2, stroke: strokeColor || '#000', strokeWidth: strokeWidth || 1 } });
                }
            }

            if (fullText) {
                const { x, y, width, height } = this.getTransform(sp, scale, parentOffset);
                blocks.push({ type: 'text', props: { text: fullText, x, y, fontSize: Math.round(fontSize * scale), color, width, height } });
            }
            return blocks;
        } catch (e) {
            console.error('Error processing shape', e);
            return [];
        }
    }

    private getFillColor(spPr: any): string | undefined {
        if (spPr?.['a:noFill']) return 'transparent';
        const solid = spPr?.['a:solidFill']?.[0];
        const srgb = solid?.['a:srgbClr']?.[0]?.['$']?.val;
        if (srgb) return `#${srgb}`;
        const scheme = solid?.['a:schemeClr']?.[0]?.['$']?.val;
        if (scheme === 'bg1' || scheme === 'lt1' || scheme === 'lt2') return '#ffffff';
        if (scheme === 'dk1' || scheme === 'dk2') return '#000000';
        const grad = spPr?.['a:gradFill']?.[0]?.['a:gsLst']?.[0]?.['a:gs']?.[0]?.['a:srgbClr']?.[0]?.['$']?.val;
        if (grad) return `#${grad}`;
        return undefined;
    }

    private getStrokeColor(spPr: any): string | undefined {
        const ln = spPr?.['a:ln']?.[0];
        if (ln?.['a:noFill']) return undefined;
        const solid = ln?.['a:solidFill']?.[0];
        const srgb = solid?.['a:srgbClr']?.[0]?.['$']?.val;
        if (srgb) return `#${srgb}`;
        const scheme = solid?.['a:schemeClr']?.[0]?.['$']?.val;
        if (scheme === 'bg1' || scheme === 'lt1' || scheme === 'lt2') return '#ffffff';
        if (scheme === 'dk1' || scheme === 'dk2') return '#000000';
        return undefined;
    }

    private getStrokeWidth(spPr: any): number | undefined {
        const ln = spPr?.['a:ln']?.[0]?.['$']?.w;
        if (ln) {
            const emu = parseInt(ln);
            const px = emu / EMU_PER_PIXEL;
            return Math.max(1, Math.round(px));
        }
        return undefined;
    }

    private extractTextFromTxBody(txBody: any, scale: number): { text: string; fontSize: number; color: string } {
        const paragraphs = txBody?.[0]?.['a:p'] || [];
        let fullText = '';
        let fontSize = 12;
        let color = '#000000';
        let foundSize = false;
        let foundColor = false;
        for (const p of paragraphs) {
            const runs = p['a:r'];
            if (runs) {
                for (const r of runs) {
                    const t = r['a:t']?.[0];
                    if (t) {
                        fullText += t;
                        if (r['a:rPr']) {
                            const rPr = r['a:rPr'][0];
                            if (!foundSize && rPr['$'] && rPr['$'].sz) { fontSize = (parseInt(rPr['$'].sz) / 100) * (96 / 72); foundSize = true; }
                            if (!foundColor && rPr['a:solidFill']) {
                                const solidFill = rPr['a:solidFill'][0];
                                if (solidFill['a:srgbClr']) { color = '#' + solidFill['a:srgbClr'][0]['$'].val; foundColor = true; }
                                else if (solidFill['a:schemeClr']) {
                                    const scheme = solidFill['a:schemeClr'][0]['$'].val;
                                    if (['tx1', 'dk1', 'dk2'].includes(scheme)) { color = '#000000'; foundColor = true; }
                                    else if (['tx2', 'lt1', 'lt2', 'bg1'].includes(scheme)) { color = '#ffffff'; foundColor = true; }
                                }
                            }
                        }
                    }
                }
            }
            fullText += '\n';
        }
        fullText = fullText.trim();
        return { text: fullText, fontSize: Math.round(fontSize * scale), color };
    }

    private getLineColor(lnObj: any): string | undefined {
        const ln = lnObj?.[0];
        if (!ln) return undefined;
        if (ln['a:noFill']) return undefined;
        const solid = ln['a:solidFill']?.[0];
        const srgb = solid?.['a:srgbClr']?.[0]?.['$']?.val;
        if (srgb) return `#${srgb}`;
        const scheme = solid?.['a:schemeClr']?.[0]?.['$']?.val;
        if (scheme === 'bg1' || scheme === 'lt1' || scheme === 'lt2') return '#ffffff';
        if (scheme === 'dk1' || scheme === 'dk2') return '#000000';
        return undefined;
    }

    private getLineWidth(lnObj: any): number | undefined {
        const ln = lnObj?.[0]?.['$']?.w;
        if (ln) {
            const emu = parseInt(ln);
            const px = emu / EMU_PER_PIXEL;
            return Math.max(1, Math.round(px));
        }
        return undefined;
    }

    private async convertEmfWmfLocally(imgData: Buffer, ext: string, target?: { width: number; height: number }): Promise<Buffer | null> {
        const tmpDir = path.join(this.uploadDir, 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const id = uuidv4();
        const inPath = path.join(tmpDir, `in-${id}${ext}`);
        const outPath = path.join(tmpDir, `out-${id}.png`);
        fs.writeFileSync(inPath, imgData, { encoding: null });
        const run = (cmd: string, args: string[]) => new Promise<void>((resolve, reject) => {
            execFile(cmd, args, (err) => err ? reject(err) : resolve());
        });
        try {
            const argsMagick: string[] = ['-density','300', inPath, '-alpha','on','-background','transparent'];
            if (target && target.width && target.height) argsMagick.push('-resize', `${Math.max(1, Math.round(target.width))}x${Math.max(1, Math.round(target.height))}`);
            argsMagick.push(outPath);
            try { await run('magick', argsMagick); } catch { 
                const argsConvert: string[] = ['-density','300', inPath, '-alpha','on','-background','transparent'];
                if (target && target.width && target.height) argsConvert.push('-resize', `${Math.max(1, Math.round(target.width))}x${Math.max(1, Math.round(target.height))}`);
                argsConvert.push(outPath);
                await run('convert', argsConvert);
            }
        } catch {}
        let buf: Buffer | null = null;
        if (fs.existsSync(outPath)) buf = fs.readFileSync(outPath);
        if (!buf) {
            const inkscapeArgs: string[] = [inPath, '--export-type=png', `--export-filename=${outPath}`, '--export-background-opacity=0', '--export-dpi=300'];
            if (target && target.width && target.height) {
                inkscapeArgs.push(`--export-width=${Math.max(1, Math.round(target.width))}`);
                inkscapeArgs.push(`--export-height=${Math.max(1, Math.round(target.height))}`);
            }
            try { await run('inkscape', inkscapeArgs); } catch {}
            if (fs.existsSync(outPath)) buf = fs.readFileSync(outPath);
        }
        if (!buf) {
            try { await run('soffice', ['--headless', '--convert-to', 'png', '--outdir', tmpDir, inPath]); } catch {}
            const altOut = path.join(tmpDir, `${path.basename(inPath, ext)}.png`);
            if (fs.existsSync(altOut)) buf = fs.readFileSync(altOut);
        }
        try { fs.unlinkSync(inPath); } catch {}
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
        return buf;
    }

    async convertEmfWmf(imgData: Buffer, ext: string, target?: { width: number; height: number }): Promise<Buffer | null> {
        return await this.convertEmfWmfLocally(imgData, ext, target);
    }

    private async processGroup(grp: any, scale: number, relMap: Record<string, string>, parentOffset: { x: number, y: number }): Promise<Block[]> {
        const blocks: Block[] = [];
        const { x: gx, y: gy } = this.getTransform(grp, scale, parentOffset);
        const offset = { x: gx, y: gy };
        const shapes = grp['p:sp'] || [];
        for (const sp of shapes) {
            const arr = await this.extractBlocksFromShape(sp, scale, offset);
            for (const b of arr) blocks.push(b);
        }
        const pics = grp['p:pic'] || [];
        for (const pic of pics) {
            const b = await this.processPicture(pic, scale, relMap);
            if (b) {
                const t = this.getTransform(pic, scale, offset);
                blocks.push({ type: 'image', props: { ...b.props, x: t.x, y: t.y } });
            }
        }
        const gfs = grp['p:graphicFrame'] || [];
        for (const gf of gfs) {
            const b = await this.processGraphicFrame(gf, scale, offset);
            if (b) blocks.push(b);
        }
        const childGroups = grp['p:grpSp'] || [];
        for (const cg of childGroups) {
            const gBlocks = await this.processGroup(cg, scale, relMap, offset);
            for (const b of gBlocks) blocks.push(b);
        }
        return blocks;
    }

    private async processPicture(pic: any, scale: number, relMap: Record<string, string>): Promise<Block | null> {
        try {
            const blipFill = pic['p:blipFill']?.[0];
            const blip = blipFill?.['a:blip']?.[0];
            const embedId = blip?.['$']?.['r:embed'];

            if (!embedId) return null;

            if (!relMap[embedId]) {
                console.warn(`[PPTX] Image embed ID ${embedId} not found in relationships`);
                return null;
            }

            let target = relMap[embedId];
            console.log(`[PPTX] Processing image: ${target} (embed: ${embedId})`);

            // Resolve path
            let imagePath = '';
            if (target.startsWith('../')) {
                imagePath = 'ppt/' + target.substring(3);
            } else {
                imagePath = 'ppt/slides/' + target;
            }
            imagePath = imagePath.replace(/\\/g, '/');

            let imgData: Buffer | undefined = await this.zip.file(imagePath)?.async('nodebuffer');

            // Fallback strategies
            if (!imgData) {
                console.warn(`[PPTX] Image not found at: ${imagePath}`);
                const allFiles = Object.keys(this.zip.files);
                const lowerPath = imagePath.toLowerCase();
                const caseMatch = allFiles.find(f => f.toLowerCase() === lowerPath);

                if (caseMatch) {
                    console.log(`[PPTX] Found with different case: ${caseMatch}`);
                    imgData = await this.zip.file(caseMatch)?.async('nodebuffer');
                } else {
                    const targetName = path.basename(target).toLowerCase();
                    const nameMatch = allFiles.find(f =>
                        path.basename(f).toLowerCase() === targetName && f.includes('media')
                    );

                    if (nameMatch) {
                        console.log(`[PPTX] Found by filename: ${nameMatch}`);
                        imgData = await this.zip.file(nameMatch)?.async('nodebuffer');
                    } else {
                        console.error(`[PPTX] Failed to find image. Available:`,
                            allFiles.filter(f => f.includes('media')));
                        return null;
                    }
                }
            }

            // Prefer raster fallback for EMF/WMF
            const origExt = path.extname(target).toLowerCase();
            if ((!imgData || imgData.length === 0) || origExt === '.emf' || origExt === '.wmf') {
                const allFiles = Object.keys(this.zip.files);
                const stem = path.basename(target, path.extname(target));
                const candidates = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'];
                const found = allFiles.find(f => {
                    const lower = f.toLowerCase();
                    return lower.includes('ppt/media/') && candidates.some(ext => lower.endsWith(`/${stem}${ext}`));
                });
                if (found) {
                    imagePath = found;
                    target = path.basename(found);
                    imgData = await this.zip.file(found)?.async('nodebuffer');
                }
            }

            if (!imgData || imgData.length === 0) {
                console.error(`[PPTX] Empty image data for ${target}`);
                return null;
            }

            const header = imgData.slice(0, 4).toString('hex');
            console.log(`[PPTX] Image ${target}: ${imgData.length} bytes, header: ${header}`);

            // Detect format from header
            let ext = path.extname(target);
            const isJpg = header.startsWith('ffd8ff');
            const isPng = header.startsWith('89504e47');
            const isGif = header.startsWith('47494638');
            const isBmp = header.startsWith('424d');
            const isRaster = isJpg || isPng || isGif || isBmp;
            if (isJpg) {
                ext = '.jpg';
            } else if (isPng) {
                ext = '.png';
            } else if (isGif) {
                ext = '.gif';
            } else if (isBmp) {
                ext = '.bmp';
            } else if (!isRaster && (origExt === '.emf' || origExt === '.wmf')) {
                const desired = this.getTransform(pic, scale);
                const tw = Math.max(1, Math.round(desired.width * 2));
                const th = Math.max(1, Math.round(desired.height * 2));
                let converted = await this.convertEmfWmfLocally(imgData, origExt, { width: tw, height: th });
                if (!converted) {
                    const convUrl = process.env.EMF_CONVERTER_URL;
                    if (convUrl) {
                        try {
                            const r = await axios.post(convUrl, imgData, { responseType: 'arraybuffer', headers: { 'Content-Type': 'application/octet-stream' } });
                            converted = Buffer.from(r.data);
                        } catch {}
                    }
                }
                if (!converted) return null;
                imgData = converted;
                ext = '.png';
            } else if (!ext || ext.length > 5) {
                console.warn(`[PPTX] Unknown format (${header}). Skipping.`);
                return null;
            }

            // Save image
            const filename = `imported-${uuidv4()}${ext}`;
            const savePath = path.join(this.uploadDir, filename);

            if (!fs.existsSync(this.uploadDir)) {
                fs.mkdirSync(this.uploadDir, { recursive: true });
            }

            // Write as binary (encoding: null is important!)
            fs.writeFileSync(savePath, imgData, { encoding: null });

            // Verify
            const written = fs.readFileSync(savePath);
            if (written.length !== imgData.length) {
                console.error(`[PPTX] Size mismatch! Expected ${imgData.length}, got ${written.length}`);
            } else {
                console.log(`[PPTX] Saved ${filename} (${written.length} bytes)`);
            }

            const { x, y, width, height } = this.getTransform(pic, scale);

            const url = this.baseUrl
                ? `${this.baseUrl}/uploads/media/${filename}`
                : `/uploads/media/${filename}`;

            return {
                type: 'image',
                props: {
                    url,
                    x,
                    y,
                    width,
                    height
                }
            };

        } catch (e) {
            console.error('[PPTX] Error processing picture:', e);
            return null;
        }
    }

    private async processGraphicFrame(gf: any, scale: number, parentOffset: { x: number, y: number }): Promise<Block | null> {
        try {
            const gd = gf['a:graphic']?.[0]?.['a:graphicData']?.[0];
            const tbl = gd?.['a:tbl']?.[0];
            if (!tbl) return null;
            const { x, y } = this.getTransformGraphic(gf, scale, parentOffset);
            const gridCols = tbl['a:tblGrid']?.[0]?.['a:gridCol'] || [];
            const colWidths = gridCols.map((gc: any) => ((parseInt(gc['$']?.w || '0') / EMU_PER_PIXEL) * scale));
            const rowsXml = tbl['a:tr'] || [];
            const rowHeights = rowsXml.map((tr: any) => ((parseInt(tr['$']?.h || '0') / EMU_PER_PIXEL) * scale) || 0);
            const cells: any[] = [];
            for (const tr of rowsXml) {
                const rowCellsXml = tr['a:tc'] || [];
                const rowCells: any[] = [];
                for (const tc of rowCellsXml) {
                    const tcPr = tc['a:tcPr']?.[0] || {};
                    const fill = this.getFillColor(tcPr) || 'transparent';
                    const lColor = this.getLineColor(tcPr['a:lnL']);
                    const rColor = this.getLineColor(tcPr['a:lnR']);
                    const tColor = this.getLineColor(tcPr['a:lnT']);
                    const bColor = this.getLineColor(tcPr['a:lnB']);
                    const lWidth = this.getLineWidth(tcPr['a:lnL']);
                    const rWidth = this.getLineWidth(tcPr['a:lnR']);
                    const tWidth = this.getLineWidth(tcPr['a:lnT']);
                    const bWidth = this.getLineWidth(tcPr['a:lnB']);
                    const txBody = tc['a:txBody'];
                    const txt = txBody ? this.extractTextFromTxBody(txBody, scale) : { text: '', fontSize: 12, color: '#000' };
                    rowCells.push({ text: txt.text, fontSize: txt.fontSize, color: txt.color, fill, borders: { l: { color: lColor, width: lWidth }, r: { color: rColor, width: rWidth }, t: { color: tColor, width: tWidth }, b: { color: bColor, width: bWidth } } });
                }
                cells.push(rowCells);
            }
            return { type: 'table', props: { x, y, columnWidths: colWidths, rowHeights, cells } };
        } catch {
            return null;
        }
    }
}
