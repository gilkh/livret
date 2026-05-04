import os

file_path = r'c:\Users\user\Documents\GitHub\livret\nvcar\server\src\routes\teacherTemplates.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace assignment.classId with enrollment.classId in the relevant section
# We can do a global replace if we are sure it's only used in checkScope calls with enrollment context
# But let's be specific

content = content.replace(
    'checkScope(settingsMap.polyvalent_exception_scope, { level: studentLevel, classId: String(assignment.classId) })',
    'checkScope(settingsMap.polyvalent_exception_scope, { level: studentLevel, classId: String(enrollment.classId) })'
)

content = content.replace(
    'checkScope(settingsMap.polyvalent_history_exception_scope, { level: studentLevel, classId: String(assignment.classId) })',
    'checkScope(settingsMap.polyvalent_history_exception_scope, { level: studentLevel, classId: String(enrollment.classId) })'
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("File fixed successfully")
