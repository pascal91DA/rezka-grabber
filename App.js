import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SearchScreen } from './src/screens/SearchScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { DebugWebViewScreen } from './src/screens/DebugWebViewScreen';

/**
 * @typedef {import('./src/types/navigation').RootStackParamList} RootStackParamList
 */

/** @type {import('@react-navigation/native-stack').createNativeStackNavigator<RootStackParamList>} */
const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={DarkTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#1a1a1a' },
            headerTintColor: '#fff',
            headerTitleStyle: { color: '#fff' },
          }}
        >
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Player"
            component={PlayerScreen}
            options={{
              title: 'Плеер',
              headerBackTitle: 'Назад'
            }}
          />
          <Stack.Screen
            name="DebugWebView"
            component={DebugWebViewScreen}
            options={{
              title: 'Отладка WebView',
              headerBackTitle: 'Назад'
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
