import { StudentDoc } from '../types/student';

export const compareStudentsByLastName = (a: StudentDoc, b: StudentDoc) => {
  const familyNameCompare = (a.firstName || '').localeCompare(b.firstName || '', 'fr', { sensitivity: 'base' })
  if (familyNameCompare !== 0) return familyNameCompare
  return (a.lastName || '').localeCompare(b.lastName || '', 'fr', { sensitivity: 'base' })
};

export const getInitials = (firstName: string, lastName: string) => {
  if (!firstName && !lastName) return '';
  const first = firstName ? firstName.charAt(0) : '';
  const last = lastName ? lastName.charAt(0) : '';
  return `${first}${last}`.toUpperCase();
};
