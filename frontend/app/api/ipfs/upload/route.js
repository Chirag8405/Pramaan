import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
    try {
        const pinataJwt = process.env.PINATA_JWT;
        if (!pinataJwt) {
            return NextResponse.json(
                { error: "Missing PINATA_JWT environment variable." },
                { status: 500 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file");

        if (!file || typeof file.arrayBuffer !== "function") {
            return NextResponse.json({ error: "Missing file in form field 'file'." }, { status: 400 });
        }

        const uploadBody = new FormData();
        uploadBody.append("file", file, file.name || "upload.bin");

        const pinataMetadata = {
            name: file.name || "pramaan-upload"
        };
        uploadBody.append("pinataMetadata", JSON.stringify(pinataMetadata));

        const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${pinataJwt}`
            },
            body: uploadBody
        });

        const payload = await pinataResponse.json().catch(() => ({}));
        if (!pinataResponse.ok) {
            return NextResponse.json(
                {
                    error: payload?.error?.reason || payload?.message || "Pinata upload failed."
                },
                { status: pinataResponse.status || 500 }
            );
        }

        const cid = payload?.IpfsHash;
        if (!cid) {
            return NextResponse.json(
                { error: "Pinata upload succeeded but did not return IpfsHash." },
                { status: 502 }
            );
        }

        return NextResponse.json({ cid }, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Unexpected upload error."
            },
            { status: 500 }
        );
    }
}