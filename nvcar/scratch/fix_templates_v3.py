import os

file_path = r'c:\Users\user\Documents\GitHub\livret\nvcar\server\src\routes\teacherTemplates.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start of the corrupted block in the GET route
# 466:         // Determine if teacher can edit
# 467:             return res.status(400).json({ error: 'missing_payload' })

start_idx = -1
for i in range(289, len(lines)):
    if '// Determine if teacher can edit' in lines[i] and 'return res.status(400).json({ error: \'missing_payload\' })' in lines[i+1]:
        start_idx = i
        break

if start_idx != -1:
    # Find the start of the next route
    # 512: // Teacher: Edit only language_toggle in template
    # 513: teacherTemplatesRouter.patch('/template-assignments/:assignmentId/language-toggle', ...
    end_idx = -1
    for i in range(start_idx + 1, len(lines)):
        if 'teacherTemplatesRouter.patch(\'/template-assignments/:assignmentId/language-toggle\'' in lines[i]:
            # The line before this is usually a comment and then a blank line
            end_idx = i - 2
            break
    
    if end_idx != -1:
        new_content = [
            '        // Determine if teacher can edit\n',
            '        // Since we enforce class assignment above, if they reach here, they can edit.\n',
            '        // UNLESS the gradebook has been signed by a subadmin\n',
            '        const isSigned = await isAssignmentSigned(assignmentId)\n',
            '        const canEdit = !isSigned // Teachers cannot edit signed gradebooks\n',
            '\n',
            '        const isProfPolyvalent = teacherClassAssignment ? !!(teacherClassAssignment as any).isProfPolyvalent : false\n',
            '\n',
            '        const completionLanguages = getCompletionLanguagesForTeacher(teacherClassAssignment)\n',
            '\n',
            '        // Check my completion status\n',
            '        const languageCompletionMap = buildLanguageCompletionMap((assignment as any).languageCompletions || [], level)\n',
            '\n',
            '        // Get active semester from the active school year\n',
            '        const activeSemester = (activeYear as any)?.activeSemester || 1\n',
            '\n',
            '        const isMyWorkCompletedSem1 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 1)\n',
            '        const isMyWorkCompletedSem2 = computeTeacherCompletionForSemester(languageCompletionMap, completionLanguages, 2)\n',
            '        const isMyWorkCompleted = activeSemester === 2 ? isMyWorkCompletedSem2 : isMyWorkCompletedSem1\n',
            '\n',
            '        res.json({\n',
            '            assignment: { ...assignment, classId: enrollment.classId },\n',
            '            template: versionedTemplate,\n',
            '            student: { ...student, level, className },\n',
            '            canEdit,\n',
            '            isSigned,\n',
            '            allowedLanguages,\n',
            '            isProfPolyvalent,\n',
            '            isMyWorkCompleted,\n',
            '            isMyWorkCompletedSem1,\n',
            '            isMyWorkCompletedSem2,\n',
            '            completionLanguages,\n',
            '            languageCompletion: languageCompletionMap,\n',
            '            activeSemester\n',
            '        })\n',
            '    } catch (e: any) {\n',
            '        res.status(500).json({ error: \'fetch_failed\', message: e.message })\n',
            '    }\n',
            '})\n',
            '\n'
        ]
        
        final_lines = lines[:start_idx] + new_content + lines[end_idx+2:]
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(final_lines)
        print("File fixed successfully")
    else:
        print("Could not find end index")
else:
    print("Could not find start index")
