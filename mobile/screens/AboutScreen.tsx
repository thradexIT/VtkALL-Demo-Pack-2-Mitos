import React, { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useIsFocused } from '@react-navigation/native'

import i18n from '@/lang/i18n'
import * as UserService from '@/services/UserService'
import Layout from '@/components/Layout'
import MitosBrandMark from '@/components/MitosBrandMark'
import { mitosBrand, mitosColors } from '@/config/mitosBrand'
import * as helper from '@/utils/helper'

const AboutScreen = ({ navigation, route }: NativeStackScreenProps<StackParams, 'About'>) => {
  const isFocused = useIsFocused()
  const [reload, setReload] = useState(false)
  const [visible, setVisible] = useState(false)

  const _init = async () => {
    setVisible(false)
    const language = await UserService.getLanguage()
    i18n.locale = language
    setVisible(true)
  }

  useEffect(() => {
    if (isFocused) {
      _init()
      setReload(true)
    } else {
      setVisible(false)
    }
  }, [route.params, isFocused])

  const onLoad = () => {
    setReload(false)
  }

  const open = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url)
      if (supported) {
        await Linking.openURL(url)
      }
    } catch (error) {
      console.error('Error opening Mitos link:', error)
    }
  }

  const Feature = ({
    icon,
    title,
    description,
  }: {
    icon: keyof typeof MaterialIcons.glyphMap
    title: string
    description: string
  }) => (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <MaterialIcons name={icon} size={22} color={mitosColors.navy} />
      </View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureText}>{description}</Text>
      </View>
    </View>
  )

  return (
    <Layout style={styles.master} navigation={navigation} route={route} onLoad={onLoad} reload={reload}>
      {visible && (
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps={helper.android() ? 'handled' : 'always'}
        >
          <View style={styles.hero}>
            <MitosBrandMark />
            <Text style={styles.tagline}>{mitosBrand.tagline}</Text>
            <View style={styles.location}>
              <MaterialIcons name="location-on" size={16} color={mitosColors.blue} />
              <Text style={styles.locationText}>{mitosBrand.market}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.eyebrow}>POR QUÉ MITOS</Text>
            <Text style={styles.sectionTitle}>Alquiler claro, directo y conectado.</Text>
            <Text style={styles.description}>
              Mitos es la experiencia de cliente de Rent A Car. La app consulta disponibilidad,
              vehículos y reservas desde el mismo dominio operativo que utiliza la versión web.
            </Text>
          </View>

          <View style={styles.section}>
            <Feature
              icon="directions-car"
              title="Flota conectada"
              description="Los vehículos visibles provienen del sistema real de alquiler."
            />
            <Feature
              icon="calendar-month"
              title="Reserva simple"
              description="Empieza con ubicación y fechas y continúa el flujo desde tu teléfono."
            />
            <Feature
              icon="verified-user"
              title="Condiciones claras"
              description="Disponibilidad y precio se confirman durante la búsqueda y reserva."
            />
            <Feature
              icon="support-agent"
              title="Atención directa"
              description="Mitos mantiene canales directos para acompañarte cuando necesites ayuda."
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.eyebrow}>CANALES MITOS</Text>
            <TouchableOpacity style={styles.linkButton} onPress={() => open(mitosBrand.websiteUrl)}>
              <MaterialIcons name="language" size={20} color={mitosColors.navy} />
              <Text style={styles.linkText}>{mitosBrand.domain}</Text>
              <MaterialIcons name="chevron-right" size={22} color={mitosColors.muted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkButton} onPress={() => open(mitosBrand.instagramUrl)}>
              <MaterialIcons name="photo-camera" size={20} color={mitosColors.navy} />
              <Text style={styles.linkText}>{mitosBrand.instagramHandle}</Text>
              <MaterialIcons name="chevron-right" size={22} color={mitosColors.muted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkButton} onPress={() => open(mitosBrand.whatsappUrl)}>
              <MaterialIcons name="chat" size={20} color={mitosColors.navy} />
              <Text style={styles.linkText}>{mitosBrand.whatsappDisplay}</Text>
              <MaterialIcons name="chevron-right" size={22} color={mitosColors.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('ToS', { d: Date.now() })}
            >
              <MaterialIcons name="description" size={20} color={mitosColors.navy} />
              <Text style={styles.linkText}>{i18n.t('TOS_TITLE')}</Text>
              <MaterialIcons name="chevron-right" size={22} color={mitosColors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerBrand}>{mitosBrand.name}</Text>
            <Text style={styles.footerText}>Versión 8.4.0 · {mitosBrand.market}</Text>
          </View>
        </ScrollView>
      )}
    </Layout>
  )
}

const styles = StyleSheet.create({
  master: {
    flex: 1,
    backgroundColor: mitosColors.soft,
  },
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: mitosColors.soft,
  },
  hero: {
    padding: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mitosColors.line,
    backgroundColor: mitosColors.white,
  },
  tagline: {
    marginTop: 10,
    color: mitosColors.body,
    fontSize: 16,
    fontWeight: '600',
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
  },
  locationText: {
    color: mitosColors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  section: {
    marginTop: 18,
  },
  eyebrow: {
    color: mitosColors.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  sectionTitle: {
    marginTop: 6,
    color: mitosColors.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  description: {
    marginTop: 10,
    color: mitosColors.body,
    fontSize: 14,
    lineHeight: 22,
  },
  feature: {
    flexDirection: 'row',
    marginBottom: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mitosColors.line,
    backgroundColor: mitosColors.white,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FC',
  },
  featureCopy: {
    flex: 1,
    marginLeft: 12,
  },
  featureTitle: {
    color: mitosColors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  featureText: {
    marginTop: 4,
    color: mitosColors.body,
    fontSize: 12,
    lineHeight: 18,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mitosColors.line,
    backgroundColor: mitosColors.white,
  },
  linkText: {
    flex: 1,
    marginLeft: 12,
    color: mitosColors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 20,
  },
  footerBrand: {
    color: mitosColors.navy,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  footerText: {
    marginTop: 5,
    color: mitosColors.muted,
    fontSize: 11,
  },
})

export default AboutScreen
