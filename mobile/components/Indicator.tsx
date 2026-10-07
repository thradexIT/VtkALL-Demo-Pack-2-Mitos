import { mitosColors } from '@/config/mitosBrand'
import React from 'react'
import { ActivityIndicator } from 'react-native'

interface IndicatorProps {
  style?: object
}

const Indicator = ({ style }: IndicatorProps) => (
  <ActivityIndicator size="large" color={mitosColors.navy} style={style} />
)

export default Indicator
