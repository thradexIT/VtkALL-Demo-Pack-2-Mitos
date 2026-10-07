const {
  createRunOncePlugin,
  withAndroidManifest,
  withGradleProperties,
} = require('@expo/config-plugins')

const upsertGradleProperty = (properties, key, value) => {
  const existing = properties.find(
    (item) => item && item.type === 'property' && item.key === key,
  )

  if (existing) {
    existing.value = value
    return
  }

  properties.push({
    type: 'property',
    key,
    value,
  })
}

const usesCleartextTraffic = (config) => {
  config = withAndroidManifest(config, (config) => {
    const { modResults } = config
    const { manifest } = modResults

    if (!Array.isArray(manifest.application)) {
      console.warn('usesCleartextTraffic: No application array in manifest')
      return config
    }

    const application = manifest.application.length > 0 && manifest.application[0]

    if (!application) {
      console.warn('usesCleartextTraffic: No .MainApplication')
      return config
    }

    application.$['android:usesCleartextTraffic'] = 'true'

    console.log('usesCleartextTraffic plugin succeeded')
    return config
  })

  config = withGradleProperties(config, (config) => {
    const properties = config.modResults

    upsertGradleProperty(
      properties,
      'org.gradle.jvmargs',
      '-Xmx3072m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8',
    )
    upsertGradleProperty(properties, 'org.gradle.workers.max', '2')
    upsertGradleProperty(properties, 'org.gradle.parallel', 'false')
    upsertGradleProperty(
      properties,
      'kotlin.daemon.jvmargs',
      '-Xmx1536m -XX:MaxMetaspaceSize=512m',
    )

    console.log('Gradle CI memory tuning plugin succeeded')
    return config
  })

  return config
}

module.exports = createRunOncePlugin(
  usesCleartextTraffic,
  'usesCleartextTraffic',
  '1.1.0',
)
