export enum LACTIONS {
    CONVERT_PAGE_TO_SAVE = 'convert-page-to-save',
    ADD_TO_NOTES = 'add-to-notes',
}

export enum LAI_PROVIDERS {
    GROQ = 'Groq',
    CHROME_AI = 'ChromeAI',
}

export enum LEXPORT_TYPE {
    READABLE = 'readable',
    IMPORTABLE = 'importable',
}

export enum LFACE_EXPRESSION {
    SLIGHTLY_SMILING = 'slightly-smiling',
    THINKING = 'thinking',
    FROWNING = 'frowning',
}

export enum LHOME_MAIN_CONTENT {
    SAVES = 'saves',
    REMINDERS = 'reminders',
    TASKS = 'tasks',
}

export enum LHOME_SEARCH_RESULT_TYPE {
    SAVE = 'save',
    TASK = 'task',
    REMINDER = 'reminder',
}

export enum LTHEME {
    LIGHT = 'little-light',
    DARK = 'little-dark',
}

export enum LLINK_TYPE {
    NOTE_VBM = 'note-vbm',
    REMINDER_VBM = 'reminder-vbm',
    REMINDER_TASK = 'reminder-task',
    TASK_VBM = 'task-vbm',
}

export enum LLOWER_HOME_NAV_ROUTES {
    SELF = '/home',
    HISTORY = '/home/history',
    NEW_REMINDER = '/home/new-reminder',
    NEW_TASK = '/home/new-task',
}

export enum LMERIDEUM {
    AM = 'AM',
    PM = 'PM',
}

export enum LRECURRING_TYPE {
    DAILY = 'daily',
    WEEKLY = 'weekly',
    MONTHLY = 'monthly',
    YEARLY = 'yearly',
}

export enum LREMINDER_TYPE {
    NORMAL = 'normal',
    ESCALATING = 'escalating',
}

export enum LSCRIPT_CONTENT {
    NOTIFICATIONS = 'notifications',
    AI = 'ai',
    None = 'none',
}

export enum LTASK_PRIORITY {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
}

export enum LTASK_SCHEDULE_TYPE {
    ADHOC = 'ad-hoc',
    RECURRING = 'recurring',
    DUE = 'due',
}

export enum LWEEKDAY_NAMES {
    SUNDAY = 'sunday',
    MONDAY = 'monday',
    TUESDAY = 'tuesday',
    WEDNESDAY = 'wednesday',
    THURSDAY = 'thursday',
    FRIDAY = 'friday',
    SATURDAY = 'saturday',
}

export enum LDB_TABLES {
    IMAGES = 'images',
    LINKS = 'links',
    NOTES = 'notes',
    NOTIFICATIONS = 'notifications',
    REMINDERS = 'reminders',
    TASKS = 'tasks',
    VISUAL_BMS = 'visual-bms',
    USER_PROFILES = 'user-profiles',
    USER_SETTINGS = 'user-settings',
    USER_VAULTS = 'user-vaults',
}

export enum LSTORAGE_PROVIDERS {
    CHROME = 'chrome',
    LITTLE_LOCAL = 'little-local',
}

export enum LCHROME_STORAGE_KEYS {
    LITTLE_LOCAL_CONFIG = 'littleLocalConfig',
    USER_SETTINGS = 'userSettings',
    TOASTS = 'toasts',
}

export enum LIMAGE_TYPE {
    WEB_PREVIEW = 'web-preview',
}

export enum LINT_BOOLEAN {
    TRUE = 1,
    FALSE = 0,
}

export enum LTOAST_TYPE {
    SUCCESS = 'success',
    ERROR = 'error',
    INFO = 'info',
    WARNING = 'warning',
}
