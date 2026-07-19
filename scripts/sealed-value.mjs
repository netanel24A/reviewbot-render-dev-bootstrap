#!/usr/bin/env node

import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    randomUUID,
    timingSafeEqual,
} from 'node:crypto'
import {
    appendFile,
    chmod,
    open,
    readFile,
    rename,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { pipeline } from 'node:stream/promises'

const MAGIC = Buffer.from('RBSEAL01', 'ascii')
const IV_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = MAGIC.length + IV_BYTES
const MINIMUM_FILE_BYTES = HEADER_BYTES + TAG_BYTES + 1

export function decodeKey(rawKey) {
    const normalized = rawKey.trim()
    if (!/^[a-f0-9]{64}$/i.test(normalized)) {
        throw new Error('key must contain exactly 64 hexadecimal characters')
    }
    return Buffer.from(normalized, 'hex')
}

async function removeIfPresent(path) {
    try {
        await unlink(path)
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error
    }
}

function temporaryPath(outputPath) {
    return `${outputPath}.${process.pid}.${randomUUID()}.tmp`
}

export async function encryptValue(inputPath, outputPath, key) {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(MAGIC)

    const pendingPath = temporaryPath(outputPath)
    try {
        await writeFile(pendingPath, Buffer.concat([MAGIC, iv]), {
            flag: 'wx',
            mode: 0o600,
        })
        await pipeline(
            createReadStream(inputPath),
            cipher,
            createWriteStream(pendingPath, { flags: 'a', mode: 0o600 })
        )
        await appendFile(pendingPath, cipher.getAuthTag())
        await chmod(pendingPath, 0o600)
        await rename(pendingPath, outputPath)
    } catch (error) {
        await removeIfPresent(pendingPath)
        throw error
    }
}

async function readEnvelopeMetadata(inputPath) {
    const metadata = await stat(inputPath)
    if (!metadata.isFile() || metadata.size < MINIMUM_FILE_BYTES) {
        throw new Error('sealed value is truncated')
    }

    const file = await open(inputPath, 'r')
    try {
        const header = Buffer.alloc(HEADER_BYTES)
        const tag = Buffer.alloc(TAG_BYTES)
        await file.read({ buffer: header, position: 0 })
        await file.read({ buffer: tag, position: metadata.size - TAG_BYTES })

        const receivedMagic = header.subarray(0, MAGIC.length)
        if (!timingSafeEqual(receivedMagic, MAGIC)) {
            throw new Error('sealed value header is invalid')
        }

        return {
            ciphertextEnd: metadata.size - TAG_BYTES - 1,
            iv: header.subarray(MAGIC.length),
            tag,
        }
    } finally {
        await file.close()
    }
}

export async function decryptValue(inputPath, outputPath, key) {
    const { ciphertextEnd, iv, tag } = await readEnvelopeMetadata(inputPath)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(MAGIC)
    decipher.setAuthTag(tag)

    const pendingPath = temporaryPath(outputPath)
    try {
        await pipeline(
            createReadStream(inputPath, {
                start: HEADER_BYTES,
                end: ciphertextEnd,
            }),
            decipher,
            createWriteStream(pendingPath, {
                flags: 'wx',
                mode: 0o600,
            })
        )
        await chmod(pendingPath, 0o600)
        await rename(pendingPath, outputPath)
    } catch (error) {
        await removeIfPresent(pendingPath)
        throw error
    }
}

async function main() {
    const [operation, inputPath, outputPath, keyPath] = process.argv.slice(2)
    if (!['encrypt', 'decrypt'].includes(operation) || !inputPath || !outputPath || !keyPath) {
        throw new Error('usage: sealed-value.mjs <encrypt|decrypt> <input> <output> <key-file>')
    }

    const key = decodeKey(await readFile(keyPath, 'utf8'))
    if (operation === 'encrypt') {
        await encryptValue(inputPath, outputPath, key)
    } else {
        await decryptValue(inputPath, outputPath, key)
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(`sealed value operation failed: ${error.message}`)
        process.exitCode = 1
    })
}
