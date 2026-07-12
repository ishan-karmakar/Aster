type LocalProfile = {
  fullName: string;
  username: string;
  email: string;
  classes: string[];
  terms: Array<{ id: string; season: string; year: number; classes: string[] }>;
  activeTermId: string;
};
export type LocalAssignment = {
  id: number;
  subject: string;
  title: string;
  due: string;
  priority: string;
  hours: number;
  progress: number;
  reminderLabel: string;
  reminderAt: string | null;
};

type LocalStore = {
  profiles: Map<string, LocalProfile>;
  assignments: Map<string, LocalAssignment[]>;
  nextAssignmentId: number;
};

const root = globalThis as typeof globalThis & {
  __asterLocalStore?: LocalStore;
};
export const localStore = (root.__asterLocalStore ??= {
  profiles: new Map(),
  assignments: new Map(),
  nextAssignmentId: 1,
});
