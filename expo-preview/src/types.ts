export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export type StudyCard = {
  id: string;
  noteId: string;
  question: string;
  answer: string;
  dueAt: number;
  intervalDays: number;
  ease: number;
  repetitions: number;
  updatedAt: number;
};

export type ReviewEvent = {
  id: string;
  cardId: string;
  grade: Grade;
  reviewedAt: number;
};

export type Backup = {
  format: 'rusukh-backup';
  version: 1;
  exportedAt: string;
  notes: Note[];
  cards: StudyCard[];
  reviews: ReviewEvent[];
};
