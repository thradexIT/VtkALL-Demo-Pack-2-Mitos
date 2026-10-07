import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, ScrollView, View, TextInput as ReactTextInput, Text } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import validator from 'validator'
import * as bookcarsTypes from ':bookcars-types'
import {
  GoogleSignin,
  GoogleSigninButton,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin'

import * as env from '@/config/env.config'

import TextInput from '@/components/TextInput'
import Button from '@/components/Button'
import Link from '@/components/Link'
import i18n from '@/lang/i18n'
import Error from '@/components/Error'
import * as UserService from '@/services/UserService'
import * as helper from '@/utils/helper'
import Switch from '@/components/Switch'
import Header from '@/components/Header'
import MitosBrandMark from '@/components/MitosBrandMark'
import { mitosBrand, mitosColors } from '@/config/mitosBrand'

const SignInScreen = ({ navigation, route }: NativeStackScreenProps<StackParams, 'SignIn'>) => {
  const isFocused = useIsFocused()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [stayConnected, setStayConnected] = useState(false)

  const [emailRequired, setEmailRequired] = useState(false)
  const [emailValid, setEmailValid] = useState(true)
  const [emailError, setEmailError] = useState(false)
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [passwordLengthError, setPasswordLengthError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [blacklisted, setBlacklisted] = useState(false)

  const emailRef = useRef<ReactTextInput>(null)
  const passwordRef = useRef<ReactTextInput>(null)

  const clear = () => {
    setEmail('')
    setPassword('')
    setStayConnected(false)

    setEmailRequired(false)
    setEmailValid(true)
    setEmailError(false)
    setPasswordRequired(false)
    setPasswordLengthError(false)
    setPasswordError(false)
    setBlacklisted(false)

    if (emailRef.current) {
      emailRef.current.clear()
    }
    if (passwordRef.current) {
      passwordRef.current.clear()
    }
  }

  const _init = async () => {
    const language = await UserService.getLanguage()
    i18n.locale = language

    clear()
  }

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: env.GG_APP_ID,
      offlineAccess: true,
    })
  }, [])

  useEffect(() => {
    if (isFocused) {
      _init()
    }
  }, [route.params, isFocused]) // eslint-disable-line react-hooks/exhaustive-deps

  const validateEmail = async () => {
    if (email) {
      setEmailRequired(false)

      if (validator.isEmail(email)) {
        try {
          const status = await UserService.validateEmail({ email })
          if (status === 204) {
            setEmailError(false)
            setEmailValid(true)
            return true
          }
          setEmailError(true)
          setEmailValid(true)
          return false
        } catch (err) {
          helper.error(err)
          setEmailError(false)
          setEmailValid(true)
          return false
        }
      } else {
        setEmailError(false)
        setEmailValid(false)
        return false
      }
    } else {
      setEmailError(false)
      setEmailValid(true)
      setEmailRequired(true)
      return false
    }
  }

  const onChangeEmail = (text: string) => {
    setEmail(text)
    setEmailRequired(false)
    setEmailValid(true)
    setEmailError(false)
    setPasswordRequired(false)
    setPasswordLengthError(false)
    setPasswordError(false)
  }

  const validatePassword = () => {
    if (!password) {
      setPasswordRequired(true)
      setPasswordLengthError(false)
      return false
    }

    if (password.length < 6) {
      setPasswordLengthError(true)
      setPasswordRequired(false)
      return false
    }

    return true
  }

  const onChangePassword = (text: string) => {
    setPassword(text)
    setPasswordRequired(false)
    setPasswordLengthError(false)
    setPasswordError(false)
  }

  const onChangeStayConnected = (checked: boolean) => {
    setStayConnected(checked)
  }

  const onPressSignIn = async () => {
    const _emailValid = await validateEmail()
    if (!_emailValid) {
      return
    }

    const passwordValid = validatePassword()
    if (!passwordValid) {
      return
    }

    const data: bookcarsTypes.SignInPayload = {
      email,
      password,
      stayConnected,
      mobile: true,
    }

    const res = await UserService.signin(data)

    try {
      if (res.status === 200) {
        if (res.data.blacklisted) {
          await UserService.signout(navigation, false)
          setPasswordError(false)
          setBlacklisted(true)
        } else {
          await helper.registerPushToken(res.data._id as string)
          await UserService.setLanguage(res.data.language || UserService.getDefaultLanguage())

          setPasswordError(false)
          setBlacklisted(false)
          clear()
          navigation.navigate('Home', { d: new Date().getTime() })
        }
      } else {
        setPasswordError(true)
        setBlacklisted(false)
      }
    } catch (err) {
      helper.error(err)
    }
  }

  const onPressGoogleSignIn = async () => {
    try {
      await GoogleSignin.hasPlayServices()
      const userInfo = await GoogleSignin.signIn()

      if (userInfo.data?.idToken) {
        const data: bookcarsTypes.SignInPayload = {
          socialSignInType: bookcarsTypes.SocialSignInType.Google,
          accessToken: userInfo.data.idToken,
          email: userInfo.data.user.email,
          fullName: userInfo.data.user.name || '',
          avatar: userInfo.data.user.photo || undefined,
          stayConnected,
          mobile: true,
        }

        const res = await UserService.socialSignin(data)

        if (res.status === 200) {
          if (res.data) {
            const user = res.data as bookcarsTypes.User

            if (user.blacklisted) {
              await UserService.signout(navigation, false)
              setPasswordError(false)
              setBlacklisted(true)
            } else {
              await helper.registerPushToken(user._id as string)
              await UserService.setLanguage(user.language || UserService.getDefaultLanguage())

              setPasswordError(false)
              setBlacklisted(false)
              clear()
              navigation.navigate('Home', { d: new Date().getTime() })
            }
          } else {
            helper.error()
          }
        } else if (res.status === 403) {
          helper.toast(i18n.t('ACCOUNT_NOT_ACTIVATED'))
        } else {
          setPasswordError(true)
          setBlacklisted(false)
        }
      }
    } catch (error) {
      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            // user cancelled the login flow
            break
          case statusCodes.IN_PROGRESS:
            // operation (e.g. sign in) is in progress already
            break
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            // play services not available or outdated
            break
          default:
            // some other error happened
            break
        }
      } else {
        // an error that's not related to google sign in occurred
        helper.error(error)
      }
    }
  }

  const onPressSignUp = () => {
    navigation.navigate('SignUp', {})
  }

  const onPressForgotPassword = () => {
    navigation.navigate('ForgotPassword', {})
  }

  return (
    <View style={styles.master}>
      <Header route={route} title={i18n.t('SIGN_IN_TITLE')} hideTitle={false} loggedIn={false} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps={helper.android() ? 'handled' : 'always'}
      >
        <View style={styles.brandCard}>
          <MitosBrandMark />
          <Text style={styles.brandTagline}>{mitosBrand.tagline}</Text>
        </View>
        <View style={styles.contentContainer}>
          <TextInput
            ref={emailRef}
            style={styles.component}
            label={i18n.t('EMAIL')}
            placeholderTextColor="rgba(0, 0, 0, 0.6)"
            value={email}
            error={emailRequired || !emailValid || emailError}
            helperText={(emailRequired && i18n.t('REQUIRED')) || (!emailValid && i18n.t('EMAIL_NOT_VALID')) || (emailError && i18n.t('EMAIL_ERROR')) || ''}
            onChangeText={onChangeEmail}
          />

          <TextInput
            ref={passwordRef}
            style={styles.component}
            secureTextEntry
            label={i18n.t('PASSWORD')}
            placeholderTextColor="rgba(0, 0, 0, 0.6)"
            value={password}
            error={passwordRequired || passwordLengthError || passwordError}
            helperText={(passwordRequired && i18n.t('REQUIRED')) || (passwordLengthError && i18n.t('PASSWORD_LENGTH_ERROR')) || (passwordError && i18n.t('PASSWORD_ERROR')) || ''}
            onChangeText={onChangePassword}
            onSubmitEditing={onPressSignIn}
          />

          <Switch style={styles.stayConnected} textStyle={styles.stayConnectedText} label={i18n.t('STAY_CONNECTED')} value={stayConnected} onValueChange={onChangeStayConnected} />

          <Button style={styles.component} label={i18n.t('SIGN_IN')} onPress={onPressSignIn} />

          <Button style={styles.component} color="secondary" label={i18n.t('SIGN_UP')} onPress={onPressSignUp} />

          <Link style={styles.link} label={i18n.t('FORGOT_PASSWORD')} onPress={onPressForgotPassword} />

          <View style={styles.googleContainer}>
            <GoogleSigninButton
              size={GoogleSigninButton.Size.Wide}
              color={GoogleSigninButton.Color.Dark}
              onPress={onPressGoogleSignIn}
            />
          </View>

          {blacklisted && <Error style={styles.error} message={i18n.t('IS_BLACKLISTED')} />}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  master: {
    flex: 1,
  },
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
    backgroundColor: mitosColors.soft,
  },
  brandCard: {
    width: '100%',
    marginBottom: 12,
    paddingHorizontal: 22,
    paddingVertical: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: mitosColors.line,
    backgroundColor: mitosColors.white,
  },
  brandTagline: {
    marginTop: 8,
    color: mitosColors.body,
    fontSize: 13,
    fontWeight: '600',
  },
  contentContainer: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  component: {
    alignSelf: 'stretch',
    margin: 10,
  },
  stayConnected: {
    alignSelf: 'stretch',
    marginLeft: 10,
    marginBottom: 10,
  },
  stayConnectedText: {
    fontSize: 12,
  },
  link: {
    margin: 10,
  },
  error: {
    marginTop: 15,
  },
  googleContainer: {
    marginTop: 10,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
})

export default SignInScreen
