export declare function secretsOperator(secret: string | string[]): {
    sign(value: string): string;
    unsign(signedValue: any): {
        valid: boolean;
        renew: boolean;
        value: string | null;
    };
};
