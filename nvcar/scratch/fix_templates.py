import os

file_path = r'c:\Users\user\Documents\GitHub\livret\nvcar\server\src\routes\teacherTemplates.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start of the mess
# 606:         const polyvalentExceptionEnabledRaw = settingsMap.polyvalent_exception_enabled === true;
# 607:         const polyvalentExceptionEnabled = polyvalentExceptionEnabledRaw && checkScope(settingsMap.polyvalent_exception_scope, { level: studentLevel, classId: String(enrollment.classId) });
# 608:         const previousYearDropdownEditableScope = settingsMap.previous_year_dropdown_editable_scope;
# 609:         const polyvalentHistoryExceptionEnabledRaw = settingsMap.polyvalent_history_exception_enabled === true;
# 610:                 message: 'Block does not have a stable blockId. Please run the migration script to fix template data.',

start_idx = -1
for i, line in enumerate(lines):
    if 'const polyvalentHistoryExceptionEnabledRaw = settingsMap.polyvalent_history_exception_enabled === true;' in line:
        start_idx = i
        break

if start_idx != -1:
    # Find the end of the mess
    # 613:             })
    # 614:         }
    end_idx = -1
    for i in range(start_idx + 1, len(lines)):
        if 'if (!blockId) {' in lines[i] or 'message: \'Block does not have a stable blockId' in lines[i]:
             # We want to replace from start_idx+1 to where 'const keyStable' starts
             pass
        if 'const keyStable = `language_toggle_${blockId}`' in lines[i]:
            end_idx = i
            break
    
    if end_idx != -1:
        new_lines = lines[:start_idx + 1]
        new_lines.append('        const polyvalentHistoryExceptionEnabled = polyvalentHistoryExceptionEnabledRaw && checkScope(settingsMap.polyvalent_history_exception_scope, { level: studentLevel, classId: String(enrollment.classId) });\n')
        new_lines.append('\n')
        new_lines.append('        const isEnglish = allowedLanguages.includes(\'en\')\n')
        new_lines.append('        const isArabic = allowedLanguages.includes(\'ar\') || allowedLanguages.includes(\'lb\')\n')
        new_lines.append('        const isTeacherQualifiedForException = (polyvalentExceptionEnabled || polyvalentHistoryExceptionEnabled) && (isProfPolyvalent || isEnglish || isArabic)\n')
        new_lines.append('\n')
        new_lines.append('        const sourceItems = Array.isArray(targetBlock?.props?.items) ? targetBlock.props.items : []\n')
        new_lines.append('        const sanitizedItems = sourceItems.length > 0\n')
        new_lines.append('            ? sourceItems.map((src: any, i: number) => ({ ...src, active: !!items?.[i]?.active }))\n')
        new_lines.append('            : items\n')
        new_lines.append('\n')
        new_lines.append('        const currentData = assignment.data || {}\n')
        new_lines.append('        const blockId = typeof targetBlock?.props?.blockId === \'string\' && targetBlock.props.blockId.trim() ? targetBlock.props.blockId.trim() : null\n')
        new_lines.append('\n')
        new_lines.append('        // REQUIRE stable blockId - no fallback to legacy format\n')
        new_lines.append('        if (!blockId) {\n')
        new_lines.append('            return res.status(400).json({\n')
        new_lines.append('                error: \'block_missing_id\',\n')
        new_lines.append('                message: \'Block does not have a stable blockId. Please run the migration script to fix template data.\',\n')
        new_lines.append('                pageIndex: actualPageIndex,\n')
        new_lines.append('                blockIndex: actualBlockIndex\n')
        new_lines.append('            })\n')
        new_lines.append('        }\n')
        new_lines.append('\n')
        new_lines.extend(lines[end_idx:])
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print("File fixed successfully")
    else:
        print("Could not find end index")
else:
    print("Could not find start index")
