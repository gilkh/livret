export type StudentDoc = {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex?: 'female' | 'male';
  parentName?: string;
  parentPhone?: string;
  fatherName?: string;
  fatherEmail?: string;
  motherEmail?: string;
  studentEmail?: string;
  level?: string;
  className?: string;
  classId?: string;
  status?: string;
  avatarUrl?: string;
  avatarHash?: string;
  logicalKey?: string;
  promotion?: { from: string; to: string; date: string; year: string }
  previousClassName?: string;
  leftAt?: string;
  leftSchoolYearId?: string;
  leftSchoolYearName?: string;
};

export type YearDoc = {
  _id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
  activeSemester?: number;
};

export type ClassDoc = {
  _id: string;
  name: string;
  level: string;
  schoolYearId: string;
};
