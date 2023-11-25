type TryFailure = {
    ok: false;
    res: null;
    err: any;
};
type TrySuccess<T> = {
    ok: true;
    res: T;
    err: null;
};

export const catchThis = <T, U extends any[]>(
    f: ((..._args: U) => T) | [object, (..._args: U) => T],
    ...args: U
): TrySuccess<T> | TryFailure => {
    if (f instanceof Array) f = f[1].bind(f[0]);
    try {
        return { res: f(...args), ok: true, err: null };
    } catch (err) {
        return { res: null, ok: false, err };
    }
};

export const catchThisAsync = async <T, U extends any[]>(
    f: ((..._args: U) => Promise<T>) | [object, (..._args: U) => Promise<T>],
    ...args: U
): Promise<TrySuccess<T> | TryFailure> => {
    if (f instanceof Array) f = f[1].bind(f[0]);
    try {
        return { res: await f(...args), ok: true, err: null };
    } catch (err) {
        return { res: null, ok: false, err };
    }
};

export class OpFail {
    ok: false = false;
    constructor(public reason: string | null, public info?: any) {}
}
export class OpOk<T> {
    ok: true = true;
    constructor(public val: T) {}
}
export class VoidOpOk {
    ok: true = true;
}
export type OpResult<T> = OpOk<T> | OpFail;
export type VoidOpResult = VoidOpOk | OpFail;
