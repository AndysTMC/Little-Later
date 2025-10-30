import { LDATE_FORMAT, LDATE_LANGUAGE, LTIME_FORMAT, LTIME_LANGUAGE } from '../constants.js';
import { LMERIDEUM, LWEEKDAY_NAMES } from '../enums.js';
import { LTime, LDate } from '../types.js';
import { format, parse } from '@formkit/tempo';

function parseLDate(ldate?: LDate): Date {
    return ldate ? parse(ldate, LDATE_FORMAT, LDATE_LANGUAGE) : new Date();
}

class LDateUtl {
    private _date: Date;
    private get inMSC(): number {
        return this._date.getTime();
    }
    public constructor(ldate: LDate) {
        this._date = parse(ldate, LDATE_FORMAT, LDATE_LANGUAGE);
    }
    public static getNow(): LDate {
        return format(new Date(), LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static from(ldate?: LDate): LDateUtl {
        return new LDateUtl(ldate ?? LDateUtl.getNow());
    }
    public static middle(ldate1: LDate, ldate2: LDate): LDate {
        const a = LDateUtl.from(ldate1).inMSC;
        const b = LDateUtl.from(ldate2).inMSC;
        return format(new Date((a + b) / 2), LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public gt(ldate?: LDate): boolean {
        return this.inMSC > LDateUtl.from(ldate ?? LDateUtl.getNow()).inMSC;
    }
    public gte(ldate?: LDate): boolean {
        return this.inMSC >= LDateUtl.from(ldate ?? LDateUtl.getNow()).inMSC;
    }
    public equals(ldate?: LDate): boolean {
        return this.inMSC === LDateUtl.from(ldate ?? LDateUtl.getNow()).inMSC;
    }
    public notEquals(ldate?: LDate): boolean {
        return this.inMSC !== LDateUtl.from(ldate ?? LDateUtl.getNow()).inMSC;
    }
    public lte(ldate?: LDate): boolean {
        return this.inMSC <= LDateUtl.from(ldate ?? LDateUtl.getNow()).inMSC;
    }
    public lt(ldate?: LDate): boolean {
        return this.inMSC < LDateUtl.from(ldate ?? LDateUtl.getNow()).inMSC;
    }
    public static compare(ldate1: LDate, ldate2: LDate): number {
        const a = LDateUtl.from(ldate1).inMSC;
        const b = LDateUtl.from(ldate2).inMSC;
        return a > b ? 1 : a < b ? -1 : 0;
    }
    public static getPrettyDate(ldate?: LDate): string {
        const target = ldate ?? LDateUtl.getNow();
        const now = LDateUtl.getNow();

        const datePart = target !== now ? target.slice(0, 10) : '';
        const hour12 = LDateUtl.getHour12HF(target);
        const minute = target.slice(14, 16);
        const mer = LDateUtl.getMerideum(target);
        return `${datePart} ${hour12}:${minute} ${mer}`.trim();
    }
    public static getYear(ldate?: LDate): number {
        return parseLDate(ldate).getFullYear();
    }
    public static getMonth(ldate?: LDate): number {
        return parseLDate(ldate).getMonth();
    }
    public static getMonthName(month: number): string {
        const names = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
        ];
        return names[month] ?? '';
    }
    public static getDay(ldate?: LDate): number {
        return parseLDate(ldate).getDate();
    }
    public static getPrettyDay(day: number): string {
        if (day === 1 || day === 21 || day === 31) return `${day}st`;
        if (day === 2 || day === 22) return `${day}nd`;
        if (day === 3 || day === 23) return `${day}rd`;
        return `${day}th`;
    }
    public static getWeekDay(ldate?: LDate): number {
        return parseLDate(ldate).getDay();
    }
    public static getWeekDayName(weekDay: number): string {
        return LDateUtl.getWeekDayNames()[weekDay] ?? '';
    }
    public static getWeekDayNames(): string[] {
        return [
            LWEEKDAY_NAMES.SUNDAY,
            LWEEKDAY_NAMES.MONDAY,
            LWEEKDAY_NAMES.TUESDAY,
            LWEEKDAY_NAMES.WEDNESDAY,
            LWEEKDAY_NAMES.THURSDAY,
            LWEEKDAY_NAMES.FRIDAY,
            LWEEKDAY_NAMES.SATURDAY,
        ];
    }
    public static getHour12HF(ldate?: LDate): number {
        const h24 = LDateUtl.getHour(ldate);
        return h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    }
    public static getHour(ldate?: LDate): number {
        return parseLDate(ldate).getHours();
    }
    public static getMinute(ldate?: LDate): number {
        return parseLDate(ldate).getMinutes();
    }
    public static getSecond(ldate?: LDate): number {
        return parseLDate(ldate).getSeconds();
    }
    public static getMerideum(ldate?: LDate): LMERIDEUM {
        return LDateUtl.getHour(ldate) < 12 ? LMERIDEUM.AM : LMERIDEUM.PM;
    }
    public static fromThisYear(ldate: LDate): boolean {
        return LDateUtl.getYear(ldate) === LDateUtl.getYear();
    }
    public static fromThisMonth(ldate: LDate): boolean {
        return (
            LDateUtl.getYear(ldate) === LDateUtl.getYear() &&
            LDateUtl.getMonth(ldate) === LDateUtl.getMonth()
        );
    }
    public static fromThisWeek(ldate: LDate): boolean {
        const target = parseLDate(ldate);
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return target >= start && target <= end;
    }
    public static fromYesterday(ldate: LDate): boolean {
        const target = parseLDate(ldate);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return (
            target.getFullYear() === yesterday.getFullYear() &&
            target.getMonth() === yesterday.getMonth() &&
            target.getDate() === yesterday.getDate()
        );
    }
    public static fromToday(ldate: LDate): boolean {
        const now = new Date();
        const target = parseLDate(ldate);
        return (
            target.getFullYear() === now.getFullYear() &&
            target.getMonth() === now.getMonth() &&
            target.getDate() === now.getDate()
        );
    }
    public static setYear(ldate: LDate, year: number): LDate {
        const d = parseLDate(ldate);
        d.setFullYear(year);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static setMonth(ldate: LDate, month: number): LDate {
        const d = parseLDate(ldate);
        d.setMonth(month);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static setDay(ldate: LDate, day: number): LDate {
        const d = parseLDate(ldate);
        d.setDate(day);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static setWeekDay(ldate: LDate, weekDay: number): LDate {
        const d = parseLDate(ldate);
        const diff = weekDay - d.getDay();
        d.setDate(d.getDate() + diff);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static setHour12HF(ldate: LDate, hour: number): LDate {
        const d = parseLDate(ldate);
        const currentMer = LDateUtl.getMerideum(ldate);
        const h24 = hour + (currentMer === LMERIDEUM.PM ? 12 : 0);
        d.setHours(h24);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static setHour(ldate: LDate, hour: number): LDate {
        const d = parseLDate(ldate);
        d.setHours(hour);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static setMinute(ldate: LDate, minute: number): LDate {
        const d = parseLDate(ldate);
        d.setMinutes(minute);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static setSecond(ldate: LDate, second: number): LDate {
        const d = parseLDate(ldate);
        d.setSeconds(second);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static shiftYear(ldate: LDate, years: number): LDate {
        const d = parseLDate(ldate);
        d.setFullYear(d.getFullYear() + years);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static shiftMonth(ldate: LDate, months: number): LDate {
        const d = parseLDate(ldate);
        d.setMonth(d.getMonth() + months);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static shiftDay(ldate: LDate, days: number): LDate {
        const d = parseLDate(ldate);
        d.setDate(d.getDate() + days);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static shiftHour(ldate: LDate, hours: number): LDate {
        const d = parseLDate(ldate);
        d.setHours(d.getHours() + hours);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static shiftMinute(ldate: LDate, minutes: number): LDate {
        const d = parseLDate(ldate);
        d.setMinutes(d.getMinutes() + minutes);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static shiftMerideum(ldate: LDate, direction: -1 | 1): LDate {
        const d = parseLDate(ldate);
        d.setHours(d.getHours() + 12 * direction);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static shiftSecond(ldate: LDate, seconds: number): LDate {
        const d = parseLDate(ldate);
        d.setSeconds(d.getSeconds() + seconds);
        return format(d, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
}

function parseLTime(ltime?: LTime): Date {
    return ltime ? parse(ltime, LTIME_FORMAT, LTIME_LANGUAGE) : new Date();
}

class LTimeUtl {
    private _date: Date;
    private get inMS(): number {
        return this._date.getTime();
    }
    public constructor(ltime: LTime) {
        this._date = parse(ltime, LTIME_FORMAT, LTIME_LANGUAGE);
    }
    public static getNow(): LTime {
        return format(new Date(), LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public static from(ltime?: LTime): LTimeUtl {
        return new LTimeUtl(ltime ?? LTimeUtl.getNow());
    }
    public toDate(): LDate {
        return format(this._date, LDATE_FORMAT, LDATE_LANGUAGE) as LDate;
    }
    public static middle(ltime1: LTime, ltime2: LTime): LTime {
        const a = LTimeUtl.from(ltime1).inMS;
        const b = LTimeUtl.from(ltime2).inMS;
        return format(new Date((a + b) / 2), LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public gt(ltime?: LTime): boolean {
        return this.inMS > LTimeUtl.from(ltime ?? LTimeUtl.getNow()).inMS;
    }
    public gte(ltime?: LTime): boolean {
        return this.inMS >= LTimeUtl.from(ltime ?? LTimeUtl.getNow()).inMS;
    }
    public equals(ltime?: LTime): boolean {
        return this.inMS === LTimeUtl.from(ltime ?? LTimeUtl.getNow()).inMS;
    }
    public notEquals(ltime?: LTime): boolean {
        return this.inMS !== LTimeUtl.from(ltime ?? LTimeUtl.getNow()).inMS;
    }
    public lte(ltime?: LTime): boolean {
        return this.inMS <= LTimeUtl.from(ltime ?? LTimeUtl.getNow()).inMS;
    }
    public lt(ltime?: LTime): boolean {
        return this.inMS < LTimeUtl.from(ltime ?? LTimeUtl.getNow()).inMS;
    }
    public static compare(ltime1: LTime, ltime2: LTime): number {
        const a = LTimeUtl.from(ltime1).inMS;
        const b = LTimeUtl.from(ltime2).inMS;
        return a > b ? 1 : a < b ? -1 : 0;
    }
    public static getPrettyTime(ltime?: LTime): string {
        const hour12 = LTimeUtl.getHour12HF(ltime);
        const minute = LTimeUtl.getMinute(ltime).toString().padStart(2, '0');
        const mer = LTimeUtl.getMerideum(ltime);
        return `${hour12}:${minute} ${mer}`;
    }
    public static getHour12HF(ltime?: LTime): number {
        const h24 = LTimeUtl.getHour(ltime);
        return h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    }
    public static getHour(ltime?: LTime): number {
        return parseLTime(ltime).getHours();
    }
    public static getMinute(ltime?: LTime): number {
        return parseLTime(ltime).getMinutes();
    }
    public static getSecond(ltime?: LTime): number {
        return parseLTime(ltime).getSeconds();
    }
    public static getMerideum(ltime?: LTime): LMERIDEUM {
        return LTimeUtl.getHour(ltime) < 12 ? LMERIDEUM.AM : LMERIDEUM.PM;
    }
    public static setHour12HF(ltime: LTime, hour: number): LTime {
        const d = parseLTime(ltime);
        const currentMer = LTimeUtl.getMerideum(ltime);
        const h24 = hour + (currentMer === LMERIDEUM.PM ? 12 : 0);
        d.setHours(h24);
        return format(d, LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public static setHour(ltime: LTime, hour: number): LTime {
        const d = parseLTime(ltime);
        d.setHours(hour);
        return format(d, LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public static setMinute(ltime: LTime, minute: number): LTime {
        const d = parseLTime(ltime);
        d.setMinutes(minute);
        return format(d, LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public static setSecond(ltime: LTime, second: number): LTime {
        const d = parseLTime(ltime);
        d.setSeconds(second);
        return format(d, LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public static shiftHour(ltime: LTime, hours: number): LTime {
        const d = parseLTime(ltime);
        d.setHours(d.getHours() + hours);
        return format(d, LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public static shiftMinute(ltime: LTime, minutes: number): LTime {
        const d = parseLTime(ltime);
        d.setMinutes(d.getMinutes() + minutes);
        return format(d, LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public static shiftMerideum(ltime: LTime, direction: -1 | 1): LTime {
        const d = parseLTime(ltime);
        d.setHours(d.getHours() + 12 * direction);
        return format(d, LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
    public static shiftSecond(ltime: LTime, seconds: number): LTime {
        const d = parseLTime(ltime);
        d.setSeconds(d.getSeconds() + seconds);
        return format(d, LTIME_FORMAT, LTIME_LANGUAGE) as LTime;
    }
}

export { LDateUtl, LTimeUtl, parseLDate, parseLTime };
