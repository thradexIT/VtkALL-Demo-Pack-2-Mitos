// App.tsx or main layout component
import { useAuth } from '@/context/AuthContext'
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import Toast from 'react-native-toast-message'
import DrawerNavigator from '@/components/DrawerNavigator'
import { mitosColors } from '@/config/mitosBrand'

interface NavigationWrapperProps {
  ref?: React.RefObject<NavigationContainerRef<StackParams> | null>
  onReady: () => void
}

const NavigationWrapper: React.FC<NavigationWrapperProps> = ({ onReady, ref: navigationRef }) => {
  const { language, refresh } = useAuth()

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={onReady}
      onStateChange={refresh}
    >
      <ExpoStatusBar style="light" backgroundColor={mitosColors.navy} translucent={false} />
      <DrawerNavigator key={language} />
      <Toast />
    </NavigationContainer>
  )
}

export default NavigationWrapper
