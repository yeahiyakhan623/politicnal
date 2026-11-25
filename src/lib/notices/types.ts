export type InstituteNotice = {
  id: string;
  title: string;
  description: string;
  category: string;
  noticeDate: string;
  format: "document" | "image";
  attachmentName: string | null;
  attachmentMimeType: string | null;
  createdAt: string;
};
