export class CoolifyAPIError extends Error {
    code;
    status;
    response;
    constructor(message, code, status, response) {
        super(message);
        this.code = code;
        this.status = status;
        this.response = response;
        this.name = 'CoolifyAPIError';
    }
}
//# sourceMappingURL=types.js.map