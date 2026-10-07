import React, { useEffect, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useIsFocused } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'

import i18n from '@/lang/i18n'
import * as UserService from '@/services/UserService'
import Layout from '@/components/Layout'
import MitosBrandMark from '@/components/MitosBrandMark'
import { mitosBrand, mitosColors } from '@/config/mitosBrand'
import * as helper from '@/utils/helper'

const ContactScreen = ({ navigation, route }: NativeStackScreenProps<StackParams, 'Contact'>) => {
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
      } else {
        Alert.alert('Mitos', 'No se pudo abrir este canal en el dispositivo.')
      }
    } catch {
      Alert.alert('Mitos', 'Ocurrió un error al abrir este canal.')
    }
  }

  const ContactItem = ({
    icon,
    title,
    subtitle,
    onPress,
  }: {
    icon: keyof typeof MaterialIcons.glyphMap
    title: string
    subtitle: string
    onPress: () => void
  }) => (
    <TouchableOpacity style={styles.contactItem} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.iconContainer}>
        <MaterialIcons name={icon} size={22} color={mitosColors.navy} />
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactTitle}>{title}</Text>
        <Text style={styles.contactSubtitle}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={mitosColors.muted} />
    </TouchableOpacity>
  )

  return (
    <Layout style={styles.master} navigation={navigation} route={route} onLoad={onLoad} reload={reload}>
      {visible && (
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps={helper.android() ? 'handled' : 'always'}
        >
          <View style={styles.header}>
            <MitosBrandMark />
            <Text style={styles.title}>Estamos para ayudarte.</Text>
            <Text style={styles.subtitle}>
              Elige el canal de Mitos que prefieras para resolver dudas sobre tu alquiler.
            </Text>
          </View>

          <View style={styles.contactList}>
            <ContactItem
              icon="chat"
              title="WhatsApp"
              subtitle={mitosBrand.whatsappDisplay}
              onPress={() => open(mitosBrand.whatsappUrl)}
            />
            <ContactItem
              icon="phone"
              title="Llamar a Mitos"
              subtitle={mitosBrand.whatsappDisplay}
              onPress={() => open(mitosBrand.phoneUri)}
            />
            <ContactItem
              icon="language"
              title="Sitio web"
              subtitle={mitosBrand.domain}
              onPress={() => open(mitosBrand.websiteUrl)}
            />
            <ContactItem
              icon="photo-camera"
              title="Instagram"
              subtitle={mitosBrand.instagramHandle}
              onPress={() => open(mitosBrand.instagramUrl)}
            />
          </View>

          <View style={styles.locationCard}>
            <MaterialIcons name="location-on" size={26} color={mitosColors.blue} />
            <View style={styles.locationCopy}>
              <Text style={styles.locationTitle}>Operación Mitos</Text>
              <Text style={styles.locationText}>{mitosBrand.operationalLocation}</Text>
              <Text style={styles.locationMeta}>{mitosBrand.market}</Text>
            </View>
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
  header: {
    marginBottom: 22,
    padding: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mitosColors.line,
    backgroundColor: mitosColors.white,
  },
  title: {
    marginTop: 18,
    color: mitosColors.ink,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 8,
    color: mitosColors.body,
    fontSize: 14,
    lineHeight: 21,
  },
  contactList: {
    marginBottom: 12,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mitosColors.line,
    backgroundColor: mitosColors.white,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FC',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactTitle: {
    color: mitosColors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  contactSubtitle: {
    marginTop: 3,
    color: mitosColors.body,
    fontSize: 12,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#EAF2FC',
  },
  locationCopy: {
    flex: 1,
    marginLeft: 12,
  },
  locationTitle: {
    color: mitosColors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  locationText: {
    marginTop: 3,
    color: mitosColors.blue,
    fontSize: 13,
    fontWeight: '700',
  },
  locationMeta: {
    marginTop: 2,
    color: mitosColors.muted,
    fontSize: 11,
  },
})

export default ContactScreen
