// Observe management and retained MQTT readings; never send appliance commands.
import WebSocket from 'ws'
import { connect } from 'mqtt'
import { loadHassioConfig } from '@/util/hassio'

const expected = {
    'V_V__F___W.B_2QEUK': ['availability', 'status', 'power', 'course', 'temp', 'spin'],
    '2REBGLUBD1P_A': ['availability', 'fridge_setpoint', 'freezer_setpoint', 'door'],
}
const timeout = setTimeout(() => {
    console.error('Timed out waiting for both mapped devices and their MQTT readings')
    process.exit(1)
}, 180_000)
const snapshot = await new Promise<Record<string, any>>((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:44401/ws')
    const state: Record<string, any> = {}
    ws.on('error', reject)
    ws.on('message', (data) => {
        Object.assign(state, JSON.parse(data.toString()))
        if (
            state.ha &&
            Object.keys(expected).every((model) =>
                Object.values(state.devices ?? {}).some((dev: any) => dev.model === model && dev.mapped),
            )
        ) {
            ws.close()
            resolve(state)
        }
    })
})
const config = await loadHassioConfig(process.env.RETHINK_DATA_DIR!, process.env.RETHINK_HASSIO_OPTIONS!)
const mqtt = connect(config.homeassistant.mqtt_url, {
    username: config.homeassistant.mqtt_user,
    password: config.homeassistant.mqtt_pass,
    reconnectPeriod: 0,
})
const prefix = config.homeassistant.rethink_prefix
const required = new Map<string, string | undefined>([[`${prefix}/availability`, undefined]])
const models: Record<string, string> = {}
for (const [model, properties] of Object.entries(expected)) {
    const [id] = Object.entries(snapshot.devices).find(([, dev]: [string, any]) => dev.model === model)!
    models[id] = model
    for (const property of properties) required.set(`${prefix}/${id}/${property}`, undefined)
}
mqtt.on('error', (error) => {
    console.error(error.message)
    process.exit(1)
})
mqtt.on('connect', () => mqtt.subscribe([...required.keys()]))
mqtt.on('message', (topic, payload) => {
    if (required.has(topic)) required.set(topic, payload.toString())
    if (
        [...required].every(
            ([key, value]) =>
                value !== undefined && value !== 'None' && (!key.endsWith('/availability') || value === 'online'),
        )
    ) {
        console.log(
            JSON.stringify({ revision: snapshot.revision, models, readings: Object.fromEntries(required) }, null, 2),
        )
        clearTimeout(timeout)
        mqtt.end()
    }
})
