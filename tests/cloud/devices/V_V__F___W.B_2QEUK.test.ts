import { test } from 'node:test'
import assert from 'node:assert/strict'
import Device from '@/cloud/devices/V_V__F___W.B_2QEUK'
import { MockHAConnection, MockThinq2Device } from '@/tests/helpers/mocks'
test('physical ten-position selector sweep includes the downloaded-programme flag', () => {
    const { ha, thinq } = setup()
    const captures = [
        [
            'Cotton',
            'AAFF200A0060002B39000100EC004E000001030803080000000000000000000000000004000003008800000000000000000000000000000001030903090100030A04010000000000000003000003008800000400000000000000000000C69CBB',
        ],
        [
            'Eco 40-60',
            'AAFF200A0060002B3B000100EC004E000001030903090100030A04010000000000000003000003008800000400000000000000000000000001031D031D0400030A0401000000000000000300000300880000020000000000000000000014D4BB',
        ],
        [
            'Mix',
            'AAFF200A0060002B3D000100EC004E000001031D031D0400030A04010000000000000003000003008800000200000000000000000000000001011A011A07000307040100000000000000020000030088000003000000000000000000009F26BB',
        ],
        [
            'Quick 30',
            'AAFF200A0060002B3F000100EC004E000001011A011A0700030704010000000000000002000003008800000300000000000000000000000001001E001E220003050201000000000000000100000300880000020000000000000000000071ACBB',
        ],
        [
            'Synthetic',
            'AAFF200A0060002B40000100EC004E000001001E001E2200030502010000000000000001000003008800000200000000000000000000000001022302230200030A04010000000000000003000003008800000300000000000000000000D815BB',
        ],
        [
            'Downloaded programme',
            'AAFF200A0060002B42000100EC004E000001022302230200030A04010000000000000003000003008800000300000000000000000000000001032103212D00030A060100000080000000040088030088000005000000000000000000009368BB',
        ],
        [
            'Tub Clean',
            'AAFF200A0060002B43000100EC004E000001032103212D00030A06010000008000000004008803008800000500000000000000000000000001011001101200030106010000000000000003000003008800000200000000000000000000CF00BB',
        ],
        [
            'Hand wash/Wool',
            'AAFF200A0060002B45000100EC004E000001011001101200030106010000000000000003000003008800000200000000000000000000000001002700271B00030503010000000000000001000003008800000300000000000000000000E9F6BB',
        ],
        [
            'Dry only',
            'AAFF200A0060002B47000100EC004E000001002700271B000305030100000000000000010000030088000003000000000000000000000000010032003218000000000002000000000000060000030088000000000000000000000000000BB5BB',
        ],
        [
            'Wash + Dry',
            'AAFF200A0060002B4A000100EC004E000001003200321800000000000200000000000006000003008800000000000000000000000000000001060E060E1300030A04010200000000000004000003008800000400000000000000000000063DBB',
        ],
    ]
    for (const [programme, hex] of captures) {
        thinq.emit('data', Buffer.from(hex, 'hex'))
        assert.equal(ha.devices.washer.properties.course, programme)
    }
})
const META = { modelId: 'V_V__F___W.B_2QEUK', modelName: 'V_V__F___W.B_2QEUK', swVersion: '2.11.207' }
// Physical W4X1085NWH captures, clip_ble_v1.9.215, local provisioning.
// Owner confirmed Cotton, temperature 60 C, spin 0 then 400, and off/on.
const COTTON = Buffer.from(
    'aaff200a0060002a4d000100ec004e0039002a3b00010101002700000100000000000000000000000000000000000000000300880000000001030903090100030a040100000000000000030000030088000004000000000000000000005f01bb',
    'hex',
)
const TEMP_60 = Buffer.from(
    'aaff200a0060002aac000100ec004e0039002a7f000101010027000001030903090100030a0401000000000000000300000300880000000001030e030e0100030a06010000000000000004000003008800000400000000000000000000c04dbb',
    'hex',
)
const NO_SPIN = Buffer.from(
    'aaff200a0060002abf000100ec004e000001030e030e0100030a060100000000000000040000030088000004000000000000000000000000010300030001000301060100000000000000030000030088000004000000000000000000008014bb',
    'hex',
)
const SPIN_400 = Buffer.from(
    'aaff200a0060002ac3000100ec004e000001030003000100030106010000000000000003000003008800000400000000000000000000000001030803080100030206010000000000000004000003008800000400000000000000000000bbf4bb',
    'hex',
)
const OFF = Buffer.from(
    'aaff200a0060002ad2000100ec004e00000103080308010003020601000000000000000400000300880000040000000000000000000000000003080308010000000000000000000000000401000300880000040000000000000000000021ddbb',
    'hex',
)
const IDLE = Buffer.from(
    'aaff200a0039002a2f000100eb00270000010000000000000000000000000000000000000000030088000000000000000000000000002deabb',
    'hex',
)

function setup() {
    const ha = new MockHAConnection()
    const thinq = new MockThinq2Device('washer', META)
    const dev = new Device(ha.asConnection(), thinq, META)
    return { ha, thinq, dev }
}
test('physical settings decode from enveloped EC current records', () => {
    const { ha, thinq } = setup()
    thinq.emit('data', COTTON)
    assert.equal(ha.devices.washer.properties.course, 'Cotton')
    thinq.emit('data', TEMP_60)
    assert.equal(ha.devices.washer.properties.temp, '60 °C')
    thinq.emit('data', NO_SPIN)
    assert.equal(ha.devices.washer.properties.spin, 'No spin')
    thinq.emit('data', SPIN_400)
    assert.equal(ha.devices.washer.properties.spin, '400 rpm')
    assert.equal(ha.devices.washer.properties.status, 'Ready')
})
test('captured power-off and EB idle records decode without retaining previous settings', () => {
    const { ha, thinq } = setup()
    thinq.emit('data', OFF)
    assert.equal(ha.devices.washer.properties.status, 'Off')
    assert.equal(ha.devices.washer.properties.power, 'OFF')
    thinq.emit('data', IDLE)
    assert.equal(ha.devices.washer.properties.status, 'Ready')
    assert.equal(ha.devices.washer.properties.power, 'ON')
    assert.equal(ha.devices.washer.properties.course, 'Not selected')
})
test('read-only entities never generate cycle-control packets', () => {
    const { ha, thinq, dev } = setup()
    for (const c of Object.values(ha.devices.washer.config!.components)) assert.equal('command_topic' in c, false)
    thinq.resetRecorder()
    for (const prop of ['power', 'start', 'pause', 'set_course']) dev.setProperty(prop, 'ON')
    assert.equal(thinq.outbox.length, 0)
    dev.start()
    assert.equal(thinq.outbox[0].toString('hex'), 'aa0ef0ed1121010000001800b5bb')
})
test('captured envelopes receive delivery ACKs; malformed lengths publish no guessed state', () => {
    const { ha, thinq } = setup()
    thinq.emit('data', SPIN_400)
    assert.ok(thinq.sent.some((x) => x.cmd === 'ack'))
    const before = { ...ha.devices.washer.properties }
    const bad = Buffer.from(SPIN_400)
    bad[14] = 1
    thinq.emit('data', bad)
    assert.deepEqual(ha.devices.washer.properties, before)
})
