﻿import React, { useState } from 'react';
import { Text, Image, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import SponsorDetailScreen   from '../screens/SponsorDetailScreen';
import { C, ACT_CATEGORIES } from '../constants';
import TreeScreen        from '../screens/TreeScreen';
import SettingsScreen    from '../screens/SettingsScreen';
import HomeScreen   from '../screens/HomeScreen';
import CreateSponsorScreen from '../screens/CreateSponsorScreen';
import CreateNewActScreen from '../screens/CreateNewActScreen';
import MyStoryScreen from '../screens/MyStoryScreen';
import JoinSponsorScreen from '../screens/JoinSponsorScreen';
import MySponsorsScreen from '../screens/MySponsorsScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import FeedbackScreen    from '../screens/FeedbackScreen';
import { DayDetailScreen } from '../screens/HistoryScreen';
import DailyActScreen    from '../screens/DailyActScreen';
import AdminScreen       from '../screens/AdminScreen';
import ReviewerScreen    from '../screens/ReviewerScreen';
import OnboardingScreen  from '../screens/OnboardingScreen';
import DonationScreen    from '../screens/DonationScreen';
import LegalScreen       from '../screens/LegalScreen';
import ChooseActScreen  from '../screens/ChooseActScreen';
import SuggestActScreen       from '../screens/SuggestActScreen';
import SuggestedActsScreen    from '../screens/SuggestedActsScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ focused, emoji, image }) {
  if (image) {
    return (
      <Image
        source={image}
        style={{ width: 28, height: 28, opacity: focused ? 1 : 0.45 }}
        resizeMode="contain"
      />
    );
  }
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

function MainTabs({ days, daysReloading, user, actCategories, onStartChallenge, onComplete, onLogout, onRestart, onReloadDays }) {
  const isAdmin    = user?.role === 'OWNER';
  const isReviewer = user?.role === 'REVIEWER' || user?.role === 'OWNER';

  const renderSettings = (props) => (
    <SettingsScreen {...props}
      user={user}
      challenge={days}
      onStartChallenge={onStartChallenge}
      navigate={(dest) => {
        if (dest === 'logout') onLogout();
      }}
    />
  );

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border, borderTopWidth: 1 },
        tabBarActiveTintColor:   C.primary,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
<Tab.Screen name="Home"
  options={{ tabBarLabel: 'Home', tabBarIcon: ({ focused }) => <TabIcon focused={focused} image={require('../../assets/logo.png')} /> }}
>
        {(props) => (
          <HomeScreen {...props}
            days={days}
            daysReloading={daysReloading}
            user={user}
            onRestart={onRestart}
            onLogout={onLogout}
            onReloadDays={onReloadDays}
          />
        )}
      </Tab.Screen>


      <Tab.Screen name="Me"
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="👤" /> }}
      >
        {renderSettings}
      </Tab.Screen>

      <Tab.Screen name="Feedback"
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="💬" /> }}
        component={FeedbackScreen}
      />

      <Tab.Screen name="Tree"
        options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="🌳" /> }}
      >
        {(props) => <TreeScreen {...props} user={user} />}
      </Tab.Screen>

      {/* Reviewers/admins additionally get a Review tab: moderate act
          completions, and from the "Review Suggested Acts" button atop it,
          review the suggestions users submit. */}
      {isReviewer && (
        <Tab.Screen name="Review"
          options={{
            tabBarLabel: 'Review',
            tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="🔎" />,
          }}
        >
          {(props) => (
            <ReviewerScreen {...props}
              user={user}
              actCategories={actCategories}
            />
          )}
        </Tab.Screen>
      )}

      {isAdmin && (
        <Tab.Screen name="Admin"
          options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} emoji="🔐" /> }}
          component={AdminScreen}
        />
      )}

    </Tab.Navigator>
  );
}

export default function AppNavigator({ days, daysReloading, user, actCategories, onLogin, onLogout, onRestart, onStartChallenge, onComplete, onDelete, onReloadDays }) {
  const [pendingLoginData, setPendingLoginData] = useState(null);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Main">
              {(props) => (
                <MainTabs {...props}
                  days={days}
                  daysReloading={daysReloading}
                  user={user}
                  actCategories={actCategories}
                  onStartChallenge={onStartChallenge}
                  onComplete={onComplete}
                  onLogout={onLogout}
                  onRestart={onRestart}
                  onReloadDays={onReloadDays}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="CreateSponsor" component={CreateSponsorScreen} />
            <Stack.Screen name="MySponsors" component={MySponsorsScreen} />
            <Stack.Screen name="JoinSponsor" component={JoinSponsorScreen} />
            <Stack.Screen name="CreateNewAct">
              {(props) => (
                <CreateNewActScreen {...props}
                  user={user}
                  onComplete={onComplete}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="MyStory">
              {(props) => (
                <MyStoryScreen {...props}
                  user={user}
                  days={days}
                  onComplete={onComplete}
                  onDelete={onDelete}
                />
              )}
            </Stack.Screen>
            {/* Tap on an empty today/yesterday cell routes here first.
                User picks an act, then we replace() to DailyAct with
                the chosen act in route.params.preselectedAct. */}
            <Stack.Screen name="ChooseAct" component={ChooseActScreen} />
            <Stack.Screen name="SuggestAct" component={SuggestActScreen} />
            <Stack.Screen name="SuggestedActs">
              {(props) => <SuggestedActsScreen {...props} user={user} />}
            </Stack.Screen>

            <Stack.Screen name="DailyAct">
              {(props) => (
                <DailyActScreen {...props}
                  actCategories={actCategories}
                  onComplete={(completed) => onComplete(completed)}
                  onDelete={onDelete}
                />
              )}
            </Stack.Screen>

          <Stack.Screen name="DayDetail">
              {(props) => (
                <DayDetailScreen {...props}
                  onDelete={onDelete}
                  onReloadDays={onReloadDays}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Donation"  component={DonationScreen} />
            <Stack.Screen name="Legal"     component={LegalScreen} />
            <Stack.Screen
              name="SponsorDetail"
              component={SponsorDetailScreen}
              options={({ navigation }) => ({
                headerShown: true,
                headerBackTitle: 'Back',
                headerLeft: () => (
                  <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingLeft: 12 }}>
                    <Text style={{ color: '#0a0', fontSize: 16 }}>← Back</Text>
                  </TouchableOpacity>
                 ),
               })}
            />   
          </>
        ) : (
          <>
            <Stack.Screen name="Auth">
              {(props) => {
                const { default: AuthScreen } = require('../screens/AuthScreen');
                return (
                  <AuthScreen
                    {...props}
                    onLogin={(data) => onLogin(data)}
                    onShowMission={(data) => {
                      setPendingLoginData(data);
                      props.navigation.navigate('Mission');
                    }}
                  />
                );
              }}
            </Stack.Screen>

            <Stack.Screen name="Mission">
              {(props) => (
                <OnboardingScreen
                  onDone={() => {
                    if (pendingLoginData) {
                      onLogin(pendingLoginData);
                      setPendingLoginData(null);
                    }
                  }}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="Legal" component={LegalScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
