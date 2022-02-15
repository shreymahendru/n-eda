import * as Assert from "assert";
import * as Zlib from "zlib";
import { given } from "@nivinjoseph/n-defensive";
import { Make, Profiler, Uuid } from "@nivinjoseph/n-util";
// import * as MessagePack from "msgpack-lite";
// import * as Snappy from "snappy";
import { pack, unpack } from "msgpackr";
import * as Snappy from "snappy";


suite("compression tests", () => 
{
    const brotliOptions = { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } };

    const brotliCompress = async (event: object) =>
    {
        given(event, "event").ensureHasValue().ensureIsObject();

        const stringified = JSON.stringify(event);
        // console.log("original char length", stringified.length);
        const buf = Buffer.from(stringified, "utf-8");
        // console.log("original bytes", buf.byteLength);
        const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(buf, brotliOptions);

        // console.log("brotli bytes", compressed.byteLength);

        // const base64 = compressed.toString("base64");

        // console.log("base64 char length", base64.length);

        // return base64;

        return compressed;
    };

    const brotliDecompress = async (eventData: Buffer) =>
    {
        given(eventData, "eventData").ensureHasValue();

        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(eventData, brotliOptions);

        return JSON.parse(decompressed.toString("utf8"));
    };

    const snappyCompress = async (event: object) =>
    {
        given(event, "event").ensureHasValue().ensureIsObject();

        const buf = pack(event);
        // console.log("original bytes", buf.byteLength);
        const compressed = await Snappy.compress(buf);

        // console.log("brotli bytes", compressed.byteLength);

        // const base64 = compressed.toString("base64");

        // console.log("base64 char length", base64.length);

        // return base64;

        return compressed;
    };

    const snappyDecompress = async (eventData: Buffer) =>
    {
        given(eventData, "eventData").ensureHasValue();

        const decompressed = await Snappy.uncompress(eventData, { asBuffer: true });


        return unpack(decompressed as Buffer);
    };
    
    const deflateCompress = async (event: object) =>
    {
        given(event, "event").ensureHasValue().ensureIsObject();

        const buf = pack(event);
        // console.log("original bytes", buf.byteLength);
        const compressed = await Make.callbackToPromise<Buffer>(Zlib.deflate)(buf);

        // console.log("brotli bytes", compressed.byteLength);

        // const base64 = compressed.toString("base64");

        // console.log("base64 char length", base64.length);

        // return base64;

        return compressed;
    };

    const deflateDecompress = async (eventData: Buffer) =>
    {
        given(eventData, "eventData").ensureHasValue();

        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.inflate)(eventData);


        return unpack(decompressed as Buffer);
    };

    // const snappyCompress = async (event: object) =>
    // {
    //     given(event, "event").ensureHasValue().ensureIsObject();

    //     const stringified = JSON.stringify(event);
    //     const compressed = await Make.callbackToPromise<Buffer>(Snappy.compress)(stringified);

    //     console.log("snappy bytes", compressed.byteLength);

    //     return compressed.toString("");
    // };

    // const snappyDecompress = async (eventData: string) =>
    // {
    //     given(eventData, "eventData").ensureHasValue().ensureIsString();

    //     const decompressed = await Make.callbackToPromise<string>(Snappy.uncompress)(Buffer.from(eventData, "base64"),
    //         { asBuffer: false });

    //     return JSON.parse(decompressed);
    // };

    // const messagePackCompress = async (event: object) =>
    // {
    //     given(event, "event").ensureHasValue().ensureIsObject();

    //     const encoded = MessagePack.encode(event);
    //     // const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(stringified, "utf-8"),
    //     //     brotliOptions);

    //     console.log("messagepack bytes", encoded.byteLength);
    //     return encoded.toString("base64");
    // };

    // const messagePackDecompress = async (eventData: string) =>
    // {
    //     given(eventData, "eventData").ensureHasValue().ensureIsString();

    //     // const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(Buffer.from(eventData, "base64"),
    //     //     brotliOptions);

    //     // return JSON.parse(decompressed.toString("utf8"));

    //     return MessagePack.decode(Buffer.from(eventData, "base64"));
    // };

    // const messagePackWithBrotliCompress = async (event: object) =>
    // {
    //     given(event, "event").ensureHasValue().ensureIsObject();

    //     const encoded = MessagePack.encode(event);
    //     const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(encoded);

    //     console.log("messagepackWithBrotli bytes", compressed.byteLength);

    //     return compressed.toString("base64");
    // };

    // const messagePackWithBrotliDecompress = async (eventData: string) =>
    // {
    //     given(eventData, "eventData").ensureHasValue().ensureIsString();

    //     const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(Buffer.from(eventData, "base64"));

    //     // return JSON.parse(decompressed.toString("utf8"));

    //     return MessagePack.decode(decompressed);
    // };


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
            },
            collection: [
                {
                    itemId: Uuid.create(),
                    value: "bleacher report",
                    rating: "1"
                },
                {
                    itemId: Uuid.create(),
                    value: "Sherdog",
                    rating: "2"
                },
                {
                    itemId: Uuid.create(),
                    value: "BBC Sports",
                    rating: "3"
                }
            ]
        }
    };

    test("JSON with  Brotli", async () =>
    {
        console.log("before", JSON.stringify(data).length);

        const compressed = await brotliCompress(data);

        console.log("compressed", compressed.length, compressed);

        const decompressed = await brotliDecompress(compressed);

        Assert.deepStrictEqual(data, decompressed);

        // Assert.ok(true);
    });

    test("JSON with Brotli performance", async () =>
    {
        const compressed = new Array<Buffer>();

        let profiler = new Profiler("compressor");
        for (let i = 0; i < 1000; i++)
        {
            compressed.push(await brotliCompress(data));
        }
        profiler.trace("compressed");

        console.table(profiler.traces);


        const decompressed = new Array<object>();
        profiler = new Profiler("decompressor");
        for (let i = 0; i < compressed.length; i++)
        {
            decompressed.push(await brotliDecompress(compressed[i]));
        }
        profiler.trace("decompressed");

        console.table(profiler.traces);

        Assert.ok(true);
    });

    test("Message pack with Snappy", async () =>
    {
        console.log("before", JSON.stringify(data).length);

        const compressed = await snappyCompress(data);

        console.log("compressed", compressed.length, compressed);

        const decompressed = await snappyDecompress(compressed);

        Assert.deepStrictEqual(data, decompressed);

        // Assert.ok(true);
    });

    test("Message pack with Snappy performance", async () =>
    {
        const compressed = new Array<Buffer>();

        let profiler = new Profiler("compressor");
        for (let i = 0; i < 1000; i++)
        {
            compressed.push(await snappyCompress(data));
        }
        profiler.trace("compressed");

        console.table(profiler.traces);


        const decompressed = new Array<object>();
        profiler = new Profiler("decompressor");
        for (let i = 0; i < compressed.length; i++)
        {
            decompressed.push(await snappyDecompress(compressed[i]));
        }
        profiler.trace("decompressed");

        console.table(profiler.traces);

        Assert.ok(true);
    });
    
    test("Message pack with Deflate", async () =>
    {
        console.log("before", JSON.stringify(data).length);

        const compressed = await deflateCompress(data);

        console.log("compressed", compressed.length, compressed);

        const decompressed = await deflateDecompress(compressed);

        Assert.deepStrictEqual(data, decompressed);

        // Assert.ok(true);
    });

    test("Message pack with Deflate performance", async () =>
    {
        const compressed = new Array<Buffer>();

        let profiler = new Profiler("compressor");
        for (let i = 0; i < 1000; i++)
        {
            compressed.push(await deflateCompress(data));
        }
        profiler.trace("compressed");

        console.table(profiler.traces);


        const decompressed = new Array<object>();
        profiler = new Profiler("decompressor");
        for (let i = 0; i < compressed.length; i++)
        {
            decompressed.push(await deflateDecompress(compressed[i]));
        }
        profiler.trace("decompressed");

        console.table(profiler.traces);

        Assert.ok(true);
    });

    // test("Snappy", async () =>
    // {
    //     console.log("before", JSON.stringify(data).length);

    //     const compressed = await snappyCompress(data);

    //     console.log("compressed", compressed.length, compressed);

    //     const decompressed = await snappyDecompress(compressed);

    //     Assert.deepStrictEqual(data, decompressed);

    //     // Assert.ok(true);
    // });

    // test("MessagePack", async () =>
    // {
    //     console.log("before", JSON.stringify(data).length);

    //     const compressed = await messagePackCompress(data);

    //     console.log("compressed", compressed.length, compressed);

    //     const decompressed = await messagePackDecompress(compressed);

    //     Assert.deepStrictEqual(data, decompressed);

    //     // Assert.ok(true);
    // });

    // test("MessagePackWithBrotli", async () =>
    // {
    //     console.log("before", JSON.stringify(data).length);

    //     const compressed = await messagePackWithBrotliCompress(data);

    //     console.log("compressed", compressed.length, compressed);

    //     const decompressed = await messagePackWithBrotliDecompress(compressed);

    //     Assert.deepStrictEqual(data, decompressed);

    //     // Assert.ok(true);
    // });
});