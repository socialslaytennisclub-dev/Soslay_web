import { isEmail, validateBirthDate } from "@/lib/auth";
import { changedPhoneError } from "@/lib/wa-invite";
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


/** Validasi sebelum simpan. Kunci = field, nilai = pesan error. `storedPhone` = nomor yang sudah tersimpan (tidak dicek ulang). */
export function validateProfile(profile: MemberProfile, storedPhone?: string | null): Partial<Record<ProfileField, string>> {
  const errors: Partial<Record<ProfileField, string>> = {};

  for (const field of requiredProfileFields) {
    if (!isFilled(profile[field])) errors[field] = "Required";
  }
  if (!errors.email && !isEmail(profile.email)) errors.email = "Please enter a valid email";
  if (!errors.phone) {
    const phone = changedPhoneError(profile.phone, storedPhone);
    if (phone) errors.phone = phone;
  }
  if (!errors.instagram && /\s/.test(profile.instagram)) errors.instagram = "Username tanpa spasi";
  if (!errors.birthDate) {
    const birthDate = validateBirthDate(profile.birthDate);
    if (birthDate) errors.birthDate = birthDate;
  }

  return errors;
}
