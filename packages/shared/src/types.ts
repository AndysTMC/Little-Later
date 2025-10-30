import {
    LAI_PROVIDERS,
    LFACE_EXPRESSION,
    LHOME_SEARCH_RESULT_TYPE,
    LTHEME,
    LRECURRING_TYPE,
    LREMINDER_TYPE,
    LTASK_PRIORITY,
    LTASK_SCHEDULE_TYPE,
    LLINK_TYPE,
    LTOAST_TYPE,
} from './enums.js';

export type LToast = {
    id: number;
    message: string;
    type: LTOAST_TYPE;
};

export type LAdhocTaskSchedule = {
    deadlineInfo: null;
    recurringInfo: null;
    type: LTASK_SCHEDULE_TYPE.ADHOC;
};

export type LAIOutput = {
    message: string;
    content?: LAIOutputContent;
    actions: Array<() => Promise<void> | void>;
    expression: LFACE_EXPRESSION;
};

export type LAIOutputContent = {
    saves: Array<LVisualBM>;
    reminders: Array<LReminder>;
    tasks: Array<LTask>;
    notes: Array<LNote>;
};

export type LAISettings = {
    assist: {
        provider: Exclude<LAI_PROVIDERS, LAI_PROVIDERS.CHROME_AI>;
        apiKey: string;
        model: string;
    };
    rephrase: {
        provider: LAI_PROVIDERS;
    };
    generate: {
        provider: LAI_PROVIDERS;
    };
    summarize: {
        provider: LAI_PROVIDERS;
    };
};

type LDailyRecurringInfo = {
    day: null;
    month: null;
    time: LTime;
    type: LRECURRING_TYPE.DAILY;
    weekDay: null;
};

export type LDeadlineInfo = {
    deadlineDate: LDate;
};

export type LDueTaskSchedule = {
    deadlineInfo: LDeadlineInfo;
    recurringInfo: null;
    type: LTASK_SCHEDULE_TYPE.DUE;
};

export type LHomeSearchResult = {
    data: LVisualBM | LReminder | LTask;
    type: LHOME_SEARCH_RESULT_TYPE;
    noOfMatches: number;
    totalLengthMatched: number;
};

export type LVBMPreview = {
    vbmId: number;
    blob: Blob;
};

export type LBoolean = 0 | 1;

export type LLink = LNoteVBMLink | LReminderVBMLink | LReminderTaskLink | LTaskVBMLink;

export type LLinkInsert = (
    | LNoteVBMLinkInsert
    | LReminderVBMLinkInsert
    | LReminderTaskLinkInsert
    | LTaskVBMLinkInsert
) & { id?: number };

export type LDB = {
    linkTbl: Array<LLink>;
    noteTbl: Array<LNote>;
    reminderTbl: Array<LReminder>;
    taskTbl: Array<LTask>;
    userProfileTbl: Array<LUserProfile>;
    userSettingsTbl: Array<LUserSettings>;
    userVaultTbl: Array<LUserVault>;
    visualBMTbl: Array<LVisualBM>;
    vbmPreviewTbl: Array<LVBMPreview>;
};

export type LVaultDataPostDecryptTables = {
    linkTbl: Array<LLink>;
    noteTbl: Array<LNote>;
    reminderTbl: Array<LReminder>;
    taskTbl: Array<LTask>;
    vbmPreviewTbl: Array<LVBMPreview>;
    visualBMTbl: Array<LVisualBM>;
};

export type LVaultDataPostDecrypt = {
    tables: LVaultDataPostDecryptTables;
    userSettings: LUserSettings;
};

export type LChromeStorageRecords = {
    littleLocalConfig: LittleLocalConfig;
    userSettings: LUserSettings;
    toasts: Array<LToast>;
};

export type LTime = `${number}:${number}:${number}+${number}:${number}`;

export type LDate =
    `${number}-${number}-${number}T${number}:${number}:${number}+${number}:${number}`;

type LMonthlyRecurringInfo = {
    day: number;
    month: null;
    time: LTime;
    type: LRECURRING_TYPE.MONTHLY;
    weekDay: null;
};

export type LNote = {
    content: string;
    id: number;
    lastModificationDate: LDate;
};

export type LNoteVBMLink = {
    id: number;
    noteId: number;
    reminderId: null;
    taskId: null;
    type: LLINK_TYPE.NOTE_VBM;
    vbmId: number;
};

export type LNoteVBMLinkInsert = {
    noteId: number;
    reminderId?: null;
    taskId?: null;
    type: LLINK_TYPE.NOTE_VBM;
    vbmId: number;
};

export type LNoteSearchResult = {
    data: LNote;
    noOfMatches: number;
    totalLengthMatched: number;
};

export type LRecurringInfo =
    | LDailyRecurringInfo
    | LWeeklyRecurringInfo
    | LMonthlyRecurringInfo
    | LYearlyRecurringInfo;

export type LRecurringTaskSchedule = {
    deadlineInfo: null;
    recurringInfo: LRecurringInfo;
    type: LTASK_SCHEDULE_TYPE.RECURRING;
};

export type LReminder = {
    id: number;
    lastNotificationDate: LDate;
    message: string;
    targetDate: LDate;
    type: LREMINDER_TYPE;
};

export type LReminderVBMLink = {
    id: number;
    noteId: null;
    reminderId: number;
    taskId: null;
    type: LLINK_TYPE.REMINDER_VBM;
    vbmId: number;
};

export type LReminderVBMLinkInsert = {
    noteId?: null;
    reminderId: number;
    taskId?: null;
    type: LLINK_TYPE.REMINDER_VBM;
    vbmId: number;
};

export type LReminderTaskLink = {
    id: number;
    noteId: null;
    reminderId: number;
    taskId: number;
    type: LLINK_TYPE.REMINDER_TASK;
    vbmId: null;
};

export type LReminderTaskLinkInsert = {
    noteId?: null;
    reminderId: number;
    taskId: number;
    type: LLINK_TYPE.REMINDER_TASK;
    vbmId?: null;
};

export type LTaskVBMLink = {
    id: number;
    noteId: null;
    reminderId: null;
    taskId: number;
    type: LLINK_TYPE.TASK_VBM;
    vbmId: number;
};

export type LTaskVBMLinkInsert = {
    noteId?: null;
    reminderId?: null;
    taskId: number;
    type: LLINK_TYPE.TASK_VBM;
    vbmId: number;
};

export type LGuideSetting = {
    isFirstTimeUser: boolean;
};

export type LUserSettings = {
    ai: LAISettings;
    guide: LGuideSetting;
    misc: {
        VBMLimit: number;
        VBMSameOriginLimit: number;
    };
};

export type LTaskSchedule = LAdhocTaskSchedule | LRecurringTaskSchedule | LDueTaskSchedule;

export type LTask = {
    id: number;
    information: string;
    finishDate: LDate | null;
    label: string;
    priority: LTASK_PRIORITY;
    schedule: LTaskSchedule;
};

export type LUserAvatar = {
    userId: number;
    blob: Blob | null;
};

export type LVaultDataPostEncrypt = Blob;

export type LUserVault = {
    userId: number;
    data: LVaultDataPostEncrypt;
};

export type LUserProfile = {
    userId: number;
    name: string;
    theme: LTHEME;
    isCurrent: LBoolean;
};

export type LVisualBM = {
    customName: string;
    hasBrowsed: LBoolean;
    id: number;
    isSaved: LBoolean;
    lastBrowseDate: LDate;
    title: string;
    url: string;
};

type LWeeklyRecurringInfo = {
    day: null;
    month: null;
    time: LTime;
    type: LRECURRING_TYPE.WEEKLY;
    weekDay: number;
};

type LYearlyRecurringInfo = {
    day: number;
    month: number;
    time: LTime;
    type: LRECURRING_TYPE.YEARLY;
    weekDay: null;
};

export type LittleLocalConfig = {
    isEnabled: boolean;
    port: number;
};

export type LUserProfileInsert = Omit<LUserProfile, 'userId' | 'theme' | 'isCurrent'> & {
    userId?: number;
    theme?: LTHEME;
    isCurrent?: LBoolean;
};

export type LVBMPreviewInsert = Omit<LVBMPreview, 'vbmId'> & {
    vbmId?: number;
};

export type LTaskInsert = Omit<LTask, 'id' | 'finishDate'> & {
    id?: number;
    finishDate?: LDate | null;
};

export type LNoteInsert = Omit<LNote, 'id' | 'lastModificationDate'> & {
    id?: number;
    lastModificationDate?: LDate;
};

export type LReminderInsert = Omit<LReminder, 'id' | 'lastNotificationDate'> & {
    id?: number;
    lastNotificationDate?: LDate;
};

export type LVisualBMInsert = Omit<
    LVisualBM,
    'id' | 'customName' | 'isSaved' | 'hasBrowsed' | 'lastBrowseDate'
> & {
    id?: number;
    customName?: string;
    isSaved?: LBoolean;
    hasBrowsed?: LBoolean;
    lastBrowseDate?: LDate;
};
