import HADevice from './base'
import AABBDevice from './aabb_device'
import type { Device as Thinq2Device } from '../thinq2/device'
import type { Connection } from '../homeassistant'
import type { Metadata } from '../thinq'
import { allowExtendedType } from '@/util/casting'
import { Enum } from '@/util/enum'
import { STATES } from './washer_common'

// W4X1085NWH, clip_ble_v1.9.215: enveloped 39-byte records.
// Locally captured: [2] state, [7] course, [10] spin, [11] temperature.
// Verified on the panel: Cotton=1, 60 C=6, no spin=1, 400 rpm=2.
const STATUS_LENGTH = 39
const COURSES = Enum.of({
    'Not selected': 0,
    Cotton: 1,
    'Eco 40-60': 4,
    Mix: 7,
    'Quick 30': 0x22,
    Synthetic: 2,
    'Tub Clean': 0x12,
    'Hand wash/Wool': 0x1b,
    'Dry only': 0x18,
    'Wash + Dry': 0x13,
})
const DOWNLOADED_PROGRAMME = 'Downloaded programme'
// Keep these local: Rethink 0.1.2 exports the shared tables as arrays,
// while newer versions export Enum instances.
const TEMPERATURES = Enum.of({
    'Not selected': 0,
    Cold: 1,
    '20 °C': 2,
    '30 °C': 3,
    '40 °C': 4,
    '50 °C': 5,
    '60 °C': 6,
    '95 °C': 7,
})
const SPINS = Enum.of({
    'Not selected': 0,
    'No spin': 1,
    '400 rpm': 2,
    '600 rpm': 3,
    '700 rpm': 4,
    '800 rpm': 5,
    '900 rpm': 6,
    '1000 rpm': 7,
    '1100 rpm': 8,
    '1200 rpm': 9,
    '1400 rpm': 10,
    '1600 rpm': 11,
})

export default class Device extends AABBDevice {
    constructor(HA: Connection, thinq: Thinq2Device, meta: Metadata) {
        super(HA, thinq, true)
        const enumeration = (name: string, key: string, options: string[]) => ({
            platform: 'sensor' as const,
            device_class: 'enum' as const,
            unique_id: `$deviceid-${key}`,
            state_topic: `$this/${key}`,
            name,
            options,
        })
        this.setConfig(
            allowExtendedType({
                ...HADevice.config(meta, { name: 'LG Washer', model: 'W4X1085NWH' }),
                components: {
                    status: enumeration('Status', 'status', STATES.options),
                    course: enumeration('Programme', 'course', [...COURSES.options, DOWNLOADED_PROGRAMME]),
                    temp: enumeration('Selected temperature', 'temp', TEMPERATURES.options),
                    spin: enumeration('Selected spin speed', 'spin', SPINS.options),
                    power: {
                        platform: 'binary_sensor',
                        device_class: 'power',
                        unique_id: '$deviceid-power',
                        state_topic: '$this/power',
                        name: 'Power',
                    },
                },
            }),
        )
    }

    start() {
        // Existing washer status request, verified against this physical unit.
        this.send(Buffer.from('F0ED1121010000001800', 'hex'))
    }

    processAABB(buf: Buffer) {
        this.processEnvelopedStatus(buf, 0x20, STATUS_LENGTH, this.processStatus)
    }

    processStatus(status: Buffer) {
        const state = STATES.map(status[2])
        this.publishProperty('status', state)
        this.publishProperty('power', state === undefined ? undefined : status[2] === 0 ? 'OFF' : 'ON')
        // The Download selector activates [22], while [25] holds the slot's
        // contents even on ordinary courses. Captured with the factory download.
        this.publishProperty(
            'course',
            status[22] > 0 && status[22] < 0xff ? DOWNLOADED_PROGRAMME : COURSES.map(status[7]),
        )
        this.publishProperty('temp', TEMPERATURES.map(status[11]))
        this.publishProperty('spin', SPINS.map(status[10]))
    }

    // This model's command path has not been validated. MQTT cannot actuate it.
    setProperty(_prop: string, _value: string) {}
}
