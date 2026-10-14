import { differenceInCalendarDays, format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

/** WhatsApp-style day label: "Hoy", "Ayer", the weekday within the last week,
 *  and the full date beyond that (with the year only if it isn't this one). */
export function chatDayLabel(timestamp: number, now = Date.now()): string {
  const days = differenceInCalendarDays(now, timestamp);
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days > 1 && days < 7) {
    const weekday = format(timestamp, "EEEE", { locale: es });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return format(timestamp, sameYear ? "d 'de' MMMM" : "d 'de' MMMM 'de' yyyy", { locale: es });
}

/** True when `timestamp` starts a new day compared to the previous message. */
export function startsNewDay(timestamp: number | undefined, prevTimestamp: number | undefined): boolean {
  if (!timestamp) return false;
  return !prevTimestamp || !isSameDay(timestamp, prevTimestamp);
}

export function ChatDaySeparator({ timestamp }: { timestamp: number }) {
  return (
    <div className="flex justify-center py-1.5 select-none">
      <span className="rounded-full bg-white/10 px-3 py-0.5 text-[10px] font-medium text-gray-300 shadow-sm">
        {chatDayLabel(timestamp)}
      </span>
    </div>
  );
}
