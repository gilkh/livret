export const checkScope = (scope: any, context: { level?: string, classId?: string }) => {
  if (!scope) return true; // Default to true for legacy support
  if (scope.type === 'all') return true;
  if (scope.type === 'specific') {
    if (context.level && Array.isArray(scope.levels) && scope.levels.includes(context.level)) return true;
    if (context.classId && Array.isArray(scope.classes) && scope.classes.includes(context.classId)) return true;
  }
  return false;
};
