export type PublicProfileLeader = {
  id: string;
  name: string;
  designation: string;
  bio: string;
  imageUrl: string;
};

export type PublicProfileDepartment = {
  id: string;
  name: string;
  description: string;
};

export type PublicProfileService = {
  id: string;
  name: string;
  description: string;
  url?: string;
};

export type PublicProfileLink = {
  id: string;
  label: string;
  description: string;
  url: string;
};

export type PublicProfileContact = {
  address: string;
  phones: string[];
  email: string;
};

export type InstitutePublicProfile = {
  instituteId: string;
  instituteName: string;
  heroTitle: string;
  heroTitleBn: string;
  heroDescription: string;
  overview: string;
  history: string;
  leadership: PublicProfileLeader[];
  departments: PublicProfileDepartment[];
  services: PublicProfileService[];
  contact: PublicProfileContact;
  links: PublicProfileLink[];
  updatedAt: string | null;
};
