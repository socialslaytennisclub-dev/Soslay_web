import { displayPhone } from "@/lib/wa-invite";

/** Kontak & akun resmi Social Slay Club — satu sumber untuk footer, tombol WhatsApp admin, dan link Instagram/Threads. */
const WHATSAPP_NUMBER = "6285710409390";
const INSTAGRAM_HANDLE = "socialslayclub";

export const WHATSAPP_DISPLAY = displayPhone(WHATSAPP_NUMBER);
export const whatsappUrl = (text?: string) => `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
export const THREADS_URL = `https://www.threads.com/@${INSTAGRAM_HANDLE}`;
export const CONTACT_EMAIL = "hello@slayclub.id";
