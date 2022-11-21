"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
class Queue {
    constructor(items) {
        this._first = null;
        this._last = null;
        this._length = 0;
        items === null || items === void 0 ? void 0 : items.forEach(t => this.enqueue(t));
    }
    get isEmpty() { return this._first === null; }
    get peek() { var _a, _b; return (_b = (_a = this._first) === null || _a === void 0 ? void 0 : _a.item) !== null && _b !== void 0 ? _b : null; }
    get length() { return this._length; }
    enqueue(item) {
        const node = {
            item,
            previous: this._last,
            next: null
        };
        if (this._last !== null)
            this._last.next = node;
        this._last = node;
        if (this._first === null)
            this._first = node;
        this._length++;
    }
    dequeue() {
        const node = this._first;
        let item = null;
        if (node !== null) {
            this._first = node.next;
            item = node.item;
            this._length--;
        }
        if (this._first === null)
            this._last = null;
        return item;
    }
}
exports.Queue = Queue;
//# sourceMappingURL=queue.js.map