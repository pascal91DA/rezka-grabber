import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SearchScreen } from './src/screens/SearchScreen';
import { NewReleasesScreen } from './src/screens/NewReleasesScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { DebugWebViewScreen } from './src/screens/DebugWebViewScreen';

/**
 * @typedef {import('./src/types/navigation').RootStackParamList} RootStackParamList
 * @typedef {import('./src/types/navigation').MainTabParamList} MainTabParamList
 */

/** @type {import('@react-navigation/bottom-tabs').createBottomTabNavigator<MainTabParamList>} */
const Tab = createBottomTabNavigator();

/** @type {import('@react-navigation/native-stack').createNativeStackNavigator<RootStackParamList>} */
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#2a2a2a',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: '#5eb3ff',
        tabBarInactiveTintColor: '#666',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Search') {
            iconName = focused ? 'search' : 'search-outline';
          } else if (route.name === 'NewReleases') {
            iconName = focused ? 'flame' : 'flame-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'time' : 'time-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarLabel:
          route.name === 'Search' ? 'Поиск' :
          route.name === 'NewReleases' ? 'Новинки' : 'История',
      })}
    >
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="NewReleases" component={NewReleasesScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}

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
            name="Main"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Player"
            component={PlayerScreen}
            options={{
              title: 'Плеер',
              headerBackTitle: 'Назад',
            }}
          />
          <Stack.Screen
            name="DebugWebView"
            component={DebugWebViewScreen}
            options={{
              title: 'Отладка WebView',
              headerBackTitle: 'Назад',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
