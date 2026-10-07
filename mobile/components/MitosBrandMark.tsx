import React from 'react'
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'

import { mitosBrand, mitosColors } from '@/config/mitosBrand'

interface MitosBrandMarkProps {
  compact?: boolean
  inverse?: boolean
  style?: StyleProp<ViewStyle>
}

const MitosBrandMark = ({ compact = false, inverse = false, style }: MitosBrandMarkProps) => {
  const foreground = inverse ? mitosColors.white : mitosColors.navy

  return (
    <View style={[styles.root, compact && styles.rootCompact, style]}>
      <Text style={[styles.name, compact && styles.nameCompact, { color: foreground }]}>
        {mitosBrand.shortName}
      </Text>
      <Text style={[styles.descriptor, compact && styles.descriptorCompact, { color: foreground }]}>
        {mitosBrand.descriptor}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
  },
  rootCompact: {
    minWidth: 82,
  },
  name: {
    fontSize: 34,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  nameCompact: {
    fontSize: 19,
    lineHeight: 20,
    letterSpacing: 1.5,
  },
  descriptor: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 3.2,
  },
  descriptorCompact: {
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 2,
  },
})

export default MitosBrandMark
