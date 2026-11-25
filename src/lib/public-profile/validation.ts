import type {
  InstitutePublicProfile,
  PublicProfileContact,
  PublicProfileDepartment,
  PublicProfileLeader,
  PublicProfileLink,
  PublicProfileService,
} from "@/lib/public-profile/types";

const ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+=*$/i;

function canonicalHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum: number, required = false) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const result = value.trim();
  if (required && !result) throw new Error(`${label} is required.`);
  if (result.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return result;
}

function items<T>(
  value: unknown,
  label: string,
  maximum: number,
  parse: (item: unknown, index: number) => T,
) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must contain no more than ${maximum} items.`);
  return value.map(parse);
}

function identity(value: Record<string, unknown>, label: string) {
  const id = text(value.id, `${label} ID`, 80, true);
  if (!ID.test(id)) throw new Error(`${label} ID is invalid.`);
  return id;
}

function leader(value: unknown, index: number): PublicProfileLeader {
  const data = record(value, `Leader ${index + 1}`);
  let imageUrl = text(data.imageUrl ?? "", `Leader ${index + 1} image`, 2_100_000);
  if (imageUrl && !DATA_IMAGE.test(imageUrl)) {
    const safeImageUrl = canonicalHttpsUrl(imageUrl);
    if (safeImageUrl) imageUrl = safeImageUrl;
    else throw new Error(`Leader ${index + 1} image must be an HTTPS URL or JPEG, PNG, or WebP upload.`);
  }
  if (imageUrl && !/^https:\/\//i.test(imageUrl) && !DATA_IMAGE.test(imageUrl)) {
    throw new Error(`Leader ${index + 1} image must be an HTTPS URL or JPEG, PNG, or WebP upload.`);
  }
  return {
    id: identity(data, `Leader ${index + 1}`),
    name: text(data.name, `Leader ${index + 1} name`, 180, true),
    designation: text(data.designation, `Leader ${index + 1} designation`, 180, true),
    bio: text(data.bio, `Leader ${index + 1} biography`, 2_000),
    imageUrl,
  };
}

function department(value: unknown, index: number): PublicProfileDepartment {
  const data = record(value, `Department ${index + 1}`);
  return {
    id: identity(data, `Department ${index + 1}`),
    name: text(data.name, `Department ${index + 1} name`, 180, true),
    description: text(data.description, `Department ${index + 1} description`, 2_000),
  };
}

function service(value: unknown, index: number): PublicProfileService {
  const data = record(value, `Service ${index + 1}`);
  const url = text(data.url ?? "", `Service ${index + 1} URL`, 2_048);
  const safeUrl = url ? canonicalHttpsUrl(url) : "";
  if (safeUrl === null) throw new Error(`Service ${index + 1} URL must use HTTPS.`);
  return {
    id: identity(data, `Service ${index + 1}`),
    name: text(data.name, `Service ${index + 1} name`, 180, true),
    description: text(data.description, `Service ${index + 1} description`, 2_000),
    url: safeUrl,
  };
}

function link(value: unknown, index: number): PublicProfileLink {
  const data = record(value, `Link ${index + 1}`);
  const url = text(data.url, `Link ${index + 1} URL`, 2_048, true);
  const safeUrl = canonicalHttpsUrl(url);
  if (!safeUrl) throw new Error(`Link ${index + 1} URL must be a valid HTTPS URL.`);
  return {
    id: identity(data, `Link ${index + 1}`),
    label: text(data.label, `Link ${index + 1} label`, 120, true),
    description: text(data.description, `Link ${index + 1} description`, 240),
    url: safeUrl,
  };
}

function contact(value: unknown): PublicProfileContact {
  const data = record(value, "Contact");
  const phones = items(data.phones, "Phone numbers", 10, (phone, index) =>
    text(phone, `Phone number ${index + 1}`, 40)).filter(Boolean);
  const email = text(data.email, "Contact email", 254);
  if (email && !EMAIL.test(email)) throw new Error("Contact email must be a valid email address.");
  return {
    address: text(data.address, "Address", 500, true),
    phones,
    email,
  };
}

export function validatePublicProfile(value: unknown): Omit<InstitutePublicProfile, "instituteId" | "updatedAt"> {
  const data = record(value, "Public profile");
  const leadership = items(data.leadership, "Leadership", 50, leader);
  const departments = items(data.departments, "Departments", 50, department);
  const services = items(data.services, "Services", 50, service);
  const links = items(data.links, "Official links", 50, link);
  const allIds = [...leadership, ...departments, ...services, ...links].map((item) => item.id);
  if (new Set(allIds).size !== allIds.length) throw new Error("Item IDs must be unique across the profile.");
  const totalImageLength = leadership.reduce((sum, item) => sum + item.imageUrl.length, 0);
  if (totalImageLength > 4_000_000) throw new Error("Uploaded profile images exceed the total 4 MB limit.");
  return {
    instituteName: text(data.instituteName, "Institute name", 180, true),
    heroTitle: text(data.heroTitle, "Hero title", 240, true),
    heroTitleBn: text(data.heroTitleBn ?? "", "Bengali hero title", 240),
    heroDescription: text(data.heroDescription, "Hero description", 1_000, true),
    overview: text(data.overview, "Overview", 10_000, true),
    history: text(data.history, "History", 10_000, true),
    leadership,
    departments,
    services,
    contact: contact(data.contact),
    links,
  };
}
