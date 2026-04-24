import { StudentDoc } from '../types/student';

export const compareStudentsByLastName = (a: StudentDoc, b: StudentDoc) => {
  const lastNameCompare = (a.lastName || '').localeCompare(b.lastName || '', 'fr', { sensitivity: 'base' })
  if (lastNameCompare !== 0) return lastNameCompare
  return (a.firstName || '').localeCompare(b.firstName || '', 'fr', { sensitivity: 'base' })
};

export const getInitials = (firstName: string, lastName: string) => {
  if (!firstName && !lastName) return '';
  const first = firstName ? firstName.charAt(0) : '';
  const last = lastName ? lastName.charAt(0) : '';
  return `${first}${last}`.toUpperCase();
};
