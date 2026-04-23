import mongoose from 'mongoose';
import { ExportedGradebookBatch } from './src/models/ExportedGradebookBatch';

async function run() {
    await mongoose.connect('mongodb://localhost:27017/nvcar');
    const doc = await ExportedGradebookBatch.findOne().sort({createdAt:-1}).lean() as any;
    if (doc) {
        console.log('Batch keys:', Object.keys(doc));
        console.log('File[0] keys:', doc.files?.[0] ? Object.keys(doc.files[0]) : 'no files');
        console.log('yearName:', doc.files?.[0]?.yearName);
        console.log('fileName sample:', doc.files?.[0]?.fileName);
        console.log('relativePath sample:', doc.files?.[0]?.relativePath);
    }
    process.exit(0);
}

run().catch(console.error);
