import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useIsFocused } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'

import i18n from '@/lang/i18n'
import * as helper from '@/utils/helper'
import * as UserService from '@/services/UserService'
import Layout from '@/components/Layout'
import SearchForm from '@/components/SearchForm'
import MitosBrandMark from '@/components/MitosBrandMark'
import { mitosBrand, mitosColors } from '@/config/mitosBrand'

const HomeScreen = ({ navigation, route }: NativeStackScreenProps<StackParams, 'Home'>) => {
  const isFocused = useIsFocused()

  const [init, setInit] = useState(false)
  const [visible, setVisible] = useState(false)
  const [reload, setReload] = useState(false)

  const _init = async () => {
    const language = await UserService.getLanguage()
    i18n.locale = language

    setInit(true)
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

  return (
    <Layout style={styles.master} navigation={navigation} onLoad={onLoad} reload={reload} route={route}>
      {init && visible && (
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps={helper.android() ? 'handled' : 'always'}
        >
          <View style={styles.hero}>
            <View style={styles.brandRow}>
              <MitosBrandMark />
              <View style={styles.marketPill}>
                <MaterialIcons name="location-on" size={15} color={mitosColors.navy} />
                <Text style={styles.marketText}>{mitosBrand.market}</Text>
              </View>
            </View>

            <View style={styles.heroIcon}>
              <MaterialIcons name="directions-car" size={72} color={mitosColors.white} />
            </View>

            <Text style={styles.eyebrow}>TU PRÓXIMA RUTA</Text>
            <Text style={styles.title}>Tu ruta empieza{'\\n'}cuando tú decides.</Text>
            <Text style={styles.tagline}>{mitosBrand.tagline}</Text>
          </View>

          <View style={styles.benefits}>
            <View style={styles.benefit}>
              <MaterialIcons name="verified-user" size={22} color={mitosColors.navy} />
              <View style={styles.benefitCopy}>
                <Text style={styles.benefitTitle}>Reserva simple</Text>
                <Text style={styles.benefitText}>Busca ubicación, fechas y continúa sin fricción.</Text>
              </View>
            </View>
            <View style={styles.benefit}>
              <MaterialIcons name="directions-car-filled" size={22} color={mitosColors.navy} />
              <View style={styles.benefitCopy}>
                <Text style={styles.benefitTitle}>Flota conectada</Text>
                <Text style={styles.benefitText}>Los vehículos vienen del sistema real de alquiler.</Text>
              </View>
            </View>
          </View>

          <View style={styles.searchCard}>
            <View style={styles.searchHeading}>
              <View style={styles.searchIcon}>
                <MaterialIcons name="search" size={24} color={mitosColors.white} />
              </View>
              <View style={styles.searchHeadingCopy}>
                <Text style={styles.searchTitle}>Encuentra tu auto ideal</Text>
                <Text style={styles.searchSubtitle}>Elige dónde y cuándo. Mitos consulta disponibilidad real.</Text>
              </View>
            </View>

            <SearchForm navigation={navigation} backgroundColor={mitosColors.white} />
          </View>

          <View style={styles.helpCard}>
            <MaterialIcons name="support-agent" size={28} color={mitosColors.blue} />
            <View style={styles.helpCopy}>
              <Text style={styles.helpTitle}>Mitos te acompaña</Text>
              <Text style={styles.helpText}>Reserva desde el móvil y conserva tus alquileres en un solo lugar.</Text>
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
    paddingBottom: 28,
    backgroundColor: mitosColors.soft,
  },
  hero: {
    minHeight: 330,
    margin: 14,
    marginBottom: 10,
    padding: 22,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: mitosColors.white,
    borderWidth: 1,
    borderColor: mitosColors.line,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  marketPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EEF4FC',
  },
  marketText: {
    color: mitosColors.navy,
    fontSize: 11,
    fontWeight: '800',
  },
  heroIcon: {
    width: 118,
    height: 118,
    alignSelf: 'flex-end',
    marginTop: 14,
    marginBottom: -42,
    marginRight: -8,
    borderRadius: 59,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mitosColors.navy,
  },
  eyebrow: {
    color: mitosColors.blue,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.7,
  },
  title: {
    maxWidth: 320,
    marginTop: 8,
    color: mitosColors.ink,
    fontSize: 35,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  tagline: {
    marginTop: 10,
    color: mitosColors.body,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '500',
  },
  benefits: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  benefit: {
    flex: 1,
    minHeight: 104,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mitosColors.line,
    backgroundColor: mitosColors.white,
  },
  benefitCopy: {
    marginTop: 8,
  },
  benefitTitle: {
    color: mitosColors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  benefitText: {
    marginTop: 4,
    color: mitosColors.body,
    fontSize: 11,
    lineHeight: 16,
  },
  searchCard: {
    marginHorizontal: 14,
    marginTop: 4,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mitosColors.line,
    backgroundColor: mitosColors.white,
    shadowColor: mitosColors.navy,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  searchHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  searchIcon: {
    width: 44,
    height: 44,
    marginRight: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mitosColors.navy,
  },
  searchHeadingCopy: {
    flex: 1,
  },
  searchTitle: {
    color: mitosColors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  searchSubtitle: {
    marginTop: 3,
    color: mitosColors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#EAF2FC',
  },
  helpCopy: {
    flex: 1,
    marginLeft: 12,
  },
  helpTitle: {
    color: mitosColors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  helpText: {
    marginTop: 3,
    color: mitosColors.body,
    fontSize: 11,
    lineHeight: 16,
  },
})

export default HomeScreen
