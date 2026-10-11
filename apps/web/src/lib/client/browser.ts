// Chat-app browser detection (06 S06-49).
const CHAT_APP =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|MicroMessenger|Snapchat|TikTok|musical_ly|BytedanceWebview|Twitter|KAKAOTALK/i;

export function isChatAppBrowser(userAgent: string): boolean {
  return CHAT_APP.test(userAgent) || userAgent.includes("; wv)");
}
