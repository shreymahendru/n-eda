import * as Assert from "assert";
import * as Zlib from "zlib";
import { given } from "@nivinjoseph/n-defensive";
import { Make } from "@nivinjoseph/n-util";
import * as MessagePack from "msgpack-lite";


suite("compression tests", () => 
{
    const brotliOptions = { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } };
    
    const brotliCompress = async (event: object) =>
    {
        given(event, "event").ensureHasValue().ensureIsObject();

        const stringified = JSON.stringify(event);
        const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(stringified, "utf-8"),
            brotliOptions);
        
        console.log("brotli bytes", compressed.byteLength);

        return compressed.toString("base64");
    };
    
    const brotliDecompress = async (eventData: string) =>
    {
        given(eventData, "eventData").ensureHasValue().ensureIsString();
        
        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(Buffer.from(eventData, "base64"),
            brotliOptions);
        
        return JSON.parse(decompressed.toString("utf8"));
    };
    
    const messagePackCompress = async (event: object) =>
    {
        given(event, "event").ensureHasValue().ensureIsObject();

        const encoded = MessagePack.encode(event);
        // const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(stringified, "utf-8"),
        //     brotliOptions);
        
        console.log("messagepack bytes", encoded.byteLength);
        return encoded.toString("base64");
    };

    const messagePackDecompress = async (eventData: string) =>
    {
        given(eventData, "eventData").ensureHasValue().ensureIsString();

        // const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(Buffer.from(eventData, "base64"),
        //     brotliOptions);

        // return JSON.parse(decompressed.toString("utf8"));
        
        return MessagePack.decode(Buffer.from(eventData, "base64"));
    };
    
    const messagePackWithBrotliCompress = async (event: object) =>
    {
        given(event, "event").ensureHasValue().ensureIsObject();

        const encoded = MessagePack.encode(event);
        const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(encoded);
        
        console.log("messagepackWithBrotli bytes", compressed.byteLength);

        return compressed.toString("base64");
    };

    const messagePackWithBrotliDecompress = async (eventData: string) =>
    {
        given(eventData, "eventData").ensureHasValue().ensureIsString();

        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(Buffer.from(eventData, "base64"));

        // return JSON.parse(decompressed.toString("utf8"));

        return MessagePack.decode(decompressed);
    };

    
    const data = {
        foo: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim   ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
        bar: {
            first: "nivin",
            last: "joseph",
            now: Date.now(),
            isLegal: false,
            gpa: 4.399999,
            other: null,
            ext: {
                foo: "foo",
                bar: 123
            }
        }
    };
    
    test("Brotli", async () =>
    { 
        console.log("before", JSON.stringify(data).length);
        
        const compressed = await brotliCompress(data);
        
        console.log("compressed", compressed.length, compressed);
        
        const decompressed = await brotliDecompress(compressed);
        
        Assert.deepStrictEqual(data, decompressed);
        
        // Assert.ok(true);
    });
    
    test("MessagePack", async () =>
    {
        console.log("before", JSON.stringify(data).length);

        const compressed = await messagePackCompress(data);

        console.log("compressed", compressed.length, compressed);

        const decompressed = await messagePackDecompress(compressed);

        Assert.deepStrictEqual(data, decompressed);

        // Assert.ok(true);
    });
    
    test("MessagePackWithBrotli", async () =>
    {
        console.log("before", JSON.stringify(data).length);

        const compressed = await messagePackWithBrotliCompress(data);

        console.log("compressed", compressed.length, compressed);

        const decompressed = await messagePackWithBrotliDecompress(compressed);

        Assert.deepStrictEqual(data, decompressed);

        // Assert.ok(true);
    });
});