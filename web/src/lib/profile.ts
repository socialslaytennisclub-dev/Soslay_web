import { profileSections, requiredProfileFields, type MemberProfile, type ProfileField } from "@/content/member";

function isFilled(value: MemberProfile[ProfileField]): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && String(value).trim());
}

/** Persentase kelengkapan + jumlah field kosong per section (panel "Profil kamu"). */
export function profileCompletion(profile: MemberProfile) {
  const sections = profileSections.map((section) => ({
    id: section.id,
    title: section.title,
    missing: section.fields.filter((field) => !isFilled(profile[field])).length,
  }));
  const total = profileSections.reduce((sum, section) => sum + section.fields.length, 0);
  const missing = sections.reduce((sum, section) => sum + section.missing, 0);

  return { percent: Math.round(((total - missing) / total) * 100), sections };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validasi sebelum simpan. Kunci = field, nilai = pesan error. */
export function validateProfile(profile: MemberProfile): Partial<Record<ProfileField, string>> {
  const errors: Partial<Record<ProfileField, string>> = {};

  for (const field of requiredProfileFields) {
    if (!isFilled(profile[field])) errors[field] = "Wajib diisi";
  }
  if (!errors.email && !EMAIL.test(profile.email)) errors.email = "Format email belum benar";
  if (!errors.phone && profile.phone.replace(/\D/g, "").length < 9) errors.phone = "Nomor terlalu pendek";
  if (!errors.instagram && /\s/.test(profile.instagram)) errors.instagram = "Username tanpa spasi";

  return errors;
}
