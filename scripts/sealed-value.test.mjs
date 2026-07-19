import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'

import { decodeKey, decryptValue, encryptValue } from './sealed-value.mjs'

const temporaryDirectories = []

async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), 'reviewbot-sealed-value-'))
    temporaryDirectories.push(directory)
    return {
        encrypted: join(directory, 'value.sealed'),
        input: join(directory, 'value.txt'),
        output: join(directory, 'value.decrypted.txt'),
    }
}

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true }))
    )
})

test('round-trips an arbitrary value', async () => {
    const paths = await fixture()
    const value = randomBytes(4096 + 37)
    const key = randomBytes(32)
    await writeFile(paths.input, value)

    await encryptValue(paths.input, paths.encrypted, key)
    await decryptValue(paths.encrypted, paths.output, key)

    assert.deepEqual(await readFile(paths.output), value)
    assert.notDeepEqual(await readFile(paths.encrypted), value)
})

test('rejects a wrong key without leaving plaintext output', async () => {
    const paths = await fixture()
    await writeFile(paths.input, 'rotating refresh credential')
    await encryptValue(paths.input, paths.encrypted, randomBytes(32))

    await assert.rejects(decryptValue(paths.encrypted, paths.output, randomBytes(32)))
    await assert.rejects(readFile(paths.output), { code: 'ENOENT' })
})

test('rejects ciphertext tampering without leaving plaintext output', async () => {
    const paths = await fixture()
    const key = randomBytes(32)
    await writeFile(paths.input, randomBytes(1024))
    await encryptValue(paths.input, paths.encrypted, key)

    const tampered = await readFile(paths.encrypted)
    tampered[Math.floor(tampered.length / 2)] ^= 0x80
    await writeFile(paths.encrypted, tampered)

    await assert.rejects(decryptValue(paths.encrypted, paths.output, key))
    await assert.rejects(readFile(paths.output), { code: 'ENOENT' })
})

test('rejects malformed keys and truncated envelopes', async () => {
    const paths = await fixture()
    assert.throws(() => decodeKey('short'), /64 hexadecimal/)
    assert.equal(decodeKey(`${'a'.repeat(64)}\n`).length, 32)

    await writeFile(paths.encrypted, 'RBSEAL01')
    await assert.rejects(
        decryptValue(paths.encrypted, paths.output, randomBytes(32)),
        /truncated/
    )
})
