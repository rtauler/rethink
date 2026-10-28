import { test } from 'node:test'
import assert from 'node:assert/strict'
import Bridge from '@/cloud/ha_bridge'
import { MockHAConnection, MockThinq2Device } from '@/tests/helpers/mocks'

test('production registry maps both local models and decodes physical captures', () => {
    const ha = new MockHAConnection()
    const bridge = new Bridge(ha.asConnection())
    const washer = new MockThinq2Device('washer', { modelId: 'V_V__F___W.B_2QEUK', modelName: 'W4X1085NWH' })
    const fridge = new MockThinq2Device('fridge', { modelId: '2REBGLUBD1P_A', modelName: 'GBBSJ11ESW' })
    bridge.newDevice(washer)
    bridge.newDevice(fridge)
    assert.equal(washer.managed, true)
    assert.equal(fridge.managed, true)

    // 2026-10-28, physical washer running Mix at 20 C / 1000 rpm.
    washer.emit(
        'data',
        Buffer.from(
            'AAFF200A003900B9D2000100EB0027000006010A0110070003070201000000004220000104000300880000030000060000000000000026EEBB',
            'hex',
        ),
    )
    assert.deepEqual(ha.devices.washer.properties, {
        status: 'Washing',
        power: 'ON',
        course: 'Mix',
        temp: '20 °C',
        spin: '1000 rpm',
    })
    fridge.emit(
        'data',
        Buffer.from(
            'AA6510EB02050401FFFFFF0201FFFFFF00FFFFFF0000FFFFFFFFFFFFFFFF000101FF00FFFFFFFFFFFFFFFFFF01FF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0078FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0005FFFFFFFFFF0000FF0005BB',
            'hex',
        ),
    )
    assert.deepEqual(ha.devices.fridge.properties, { fridge_setpoint: 3, freezer_setpoint: -18, door: 'OFF' })
})
