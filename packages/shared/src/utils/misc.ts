import { LCHAR_LIST } from '../constants.js';

export const capitalize = (str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const cloneObject = <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
};

export const createId = (): string => {
    let id = '';
    for (let i = 0; i < 16; i++) {
        id += LCHAR_LIST[Math.floor(Math.random() * LCHAR_LIST.length)];
    }
    return id;
};

export const fakeWait = async ({ waitPeriod }: { waitPeriod?: number } = {}) => {
    await new Promise((resolve) => setTimeout(resolve, waitPeriod ?? 1200));
};

export const getDomainFromUrl = (url: string): string => {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
};

export class LIdCache {
    private pastIds: Array<number>;
    public inserts: Array<number> = [];
    public deletes: Array<number> = [];

    constructor(pastIds: Array<number>) {
        this.pastIds = cloneObject(pastIds);
    }

    get newId(): number {
        const result = Math.max(...this.pastIds, ...this.inserts);
        return result + 1;
    }

    public insert(id: number) {
        if (!this.deletes.includes(id)) {
            this.inserts = this.inserts.filter((x) => x !== id).concat([id]);
        } else {
            this.deletes = this.deletes.filter((x) => x !== id);
        }
    }

    public delete(id: number) {
        if (this.inserts.includes(id)) {
            this.inserts = this.inserts.filter((x) => x !== id);
        } else {
            this.deletes = this.deletes.filter((x) => x !== id).concat([id]);
        }
    }

    get currentIds(): Array<number> {
        let resultData = cloneObject(this.pastIds);
        resultData = resultData.filter((x) => !this.inserts.includes(x)).concat(this.inserts);
        resultData = resultData.filter((x) => !this.deletes.includes(x));
        return resultData;
    }

    public reset() {
        this.inserts = [];
        this.deletes = [];
        this.pastIds = this.currentIds;
    }
}

export class LIdObjectChangeSet<T extends { id: number }> {
    private pastObjects: Array<T>;
    public creates: Array<T> = [];
    public updates: Array<T> = [];
    public deletes: Array<T> = [];

    constructor(pastObjects: Array<T>) {
        this.pastObjects = cloneObject(pastObjects);
    }

    get newId(): number {
        const result = Math.max(
            ...this.pastObjects.map((x) => x.id),
            ...this.creates.map((x) => x.id)
        );
        return result + 1;
    }

    public insert(object: T) {
        if (!this.deletes.some((x) => x.id === object.id)) {
            this.creates = this.creates.filter((x) => x.id !== object.id).concat([object]);
        } else {
            this.deletes = this.deletes.filter((x) => x.id !== object.id);
        }
    }

    public update(object: T) {
        if (this.creates.some((x) => x.id === object.id)) {
            this.creates = this.creates.map((x) => (x.id === object.id ? object : x));
        } else {
            this.updates = this.updates.filter((x) => x.id !== object.id).concat([object]);
        }
    }

    public delete(object: T) {
        if (this.creates.some((x) => x.id === object.id)) {
            this.creates = this.creates.filter((x) => x.id !== object.id);
        } else {
            this.updates = this.updates.filter((x) => x.id !== object.id);
            this.deletes = this.deletes.filter((x) => x.id !== object.id).concat([object]);
        }
    }

    get currentObjects(): Array<T> {
        let resultData = cloneObject(this.pastObjects);
        resultData = resultData
            .filter((x) => !this.creates.some((y) => y.id == x.id))
            .concat(this.creates);
        resultData = resultData.map((x) => this.updates.find((y) => y.id === x.id) ?? x);
        resultData = resultData.filter((x) => !this.deletes.some((y) => y.id === x.id));
        return resultData;
    }

    public reset() {
        this.creates = [];
        this.updates = [];
        this.deletes = [];
        this.pastObjects = this.currentObjects;
    }
}
