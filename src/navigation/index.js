﻿import React, { useState } from 'react';
import { Text, Image, TouchableOpacity } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { updateGate } from '../lib/appUpdates';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import SponsorDetailScreen   from '../screens/SponsorDetailScreen';
import { C, ACT_CATEGORIES } from '../constants';
import { FONT } from '../lib/fonts';
import { Ionicons } from '@expo/vector-icons';
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
import HelpScreen        from '../screens/HelpScreen';
import FamilyScreen      from '../screens/FamilyScreen';
import { DayDetailScreen } from '../screens/HistoryScreen';
import DailyActScreen    from '../screens/DailyActScreen';
import AdminScreen       from '../screens/AdminScreen';
import ReviewerScreen    from '../screens/ReviewerScreen';
import OnboardingScreen  from '../screens/OnboardingScreen';
import SearchActsScreen  from '../screens/SearchActsScreen';
import DonationScreen    from '../screens/DonationScreen';
import LegalScreen       from '../screens/LegalScreen';
import ChooseActScreen  from '../screens/ChooseActScreen';
import SuggestActScreen       from '../screens/SuggestActScreen';
import SuggestedActsScreen    from '../screens/SuggestedActsScreen';
import RecognitionScreen     from '../screens/RecognitionScreen';
import BraceletFormScreen    from '../screens/BraceletFormScreen';
import BraceletPaymentScreen from '../screens/BraceletPaymentScreen';
import RecognitionAdminScreen from '../screens/RecognitionAdminScreen';
import CelebrationScreen     from '../screens/CelebrationScreen';
import CertificateScreen     from '../screens/CertificateScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Fix 10 (19 Nov 2026): simple line icons instead of emoji / pictures.
function TabIcon({ focused, name, color }) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={24} color={color} />;
}

function MainTabs({ days, daysReloading, user, actCategories, onStartChallenge, onComplete, onLogout, onRestart, onReloadDays }) {
  const isAdmin    = user?.role === 'OWNER';
  const isReviewer = user?.role === 'REVIEWER' || user?.role === 'OWNER';

  const renderSettings = (props) => (
    <SettingsScreen {...props}
      user={user}
      challenge={days}
      onStartChallenge={onStartChallenge}
      onRestart={onRestart}
      navigate={(dest) => {
        if (dest === 'logout') onLogout();
        if (dest === 'deleted') onLogout('deleted');
      }}
    />
  );

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.header, borderTopColor: C.border, borderTopWidth: 1 },
        tabBarActiveTintColor:   C.primary,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 11, ...FONT.bold },
      }}
    >
<Tab.Screen name="Home"
  options={{ tabBarLabel: 'Today', tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} name="today" /> }}
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


      {/* Fix 10: Journey = every act you have logged, newest first, with
          search (it was the "Search my acts" page). */}
      <Tab.Screen name="Journey"
        options={{ tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} name="calendar" /> }}
      >
        {(props) => <SearchActsScreen {...props} user={user} asTab />}
      </Tab.Screen>

      {/* Fix 6 (18 Nov 2026): Help and Feedback left the tab bar; they open
          from Me > Help and feedback (stack screens below). */}

      <Tab.Screen name="Tree"
        options={{ tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} name="leaf" /> }}
      >
        {(props) => <TreeScreen {...props} user={user} />}
      </Tab.Screen>

      <Tab.Screen name="Me"
        options={{ tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} name="person" /> }}
      >
        {renderSettings}
      </Tab.Screen>


      {/* Reviewers/admins additionally get a Review tab: moderate act
          completions, and from the "Review Suggested Acts" button atop it,
          review the suggestions users submit. */}
      {isReviewer && (
        <Tab.Screen name="Review"
          options={{
            tabBarLabel: 'Review',
            tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} name="search" />,
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
          options={{ tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} name="lock-closed" /> }}
          component={AdminScreen}
        />
      )}

    </Tab.Navigator>
  );
}

export default function AppNavigator({ days, daysReloading, user, actCategories, onLogin, onLogout, onRestart, onStartChallenge, onComplete, onDelete, onReloadDays }) {
  const [pendingLoginData, setPendingLoginData] = useState(null);

  // Backlog 78: tell the update gate which screen is showing, so a downloaded
  // update is only switched to on the Home tab - never mid-story or mid-sign-up.
  const navRef = useNavigationContainerRef();
  const noteRoute = () => updateGate.noteRoute(navRef.getCurrentRoute()?.name);

  return (
    <NavigationContainer ref={navRef} onReady={noteRoute} onStateChange={noteRoute}>
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
            {/* CreateSponsor is reached from Settings > "Sponsor a New Group"
                and from MySponsors. It renders no header of its own, and the
                stack hides headers by default, so it used to be a dead end:
                a user who opened it by accident had no way back. Its two views
                (the form, and the post-create QR screen) want different titles,
                so the bar carries the back arrow only. Same shape as
                SponsorDetail below. */}
            <Stack.Screen
              name="CreateSponsor"
              component={CreateSponsorScreen}
              options={({ navigation }) => ({
                headerShown: true,
                title: '',
                headerBackTitle: 'Back',
                headerLeft: () => (
                  <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingLeft: 12 }}>
                    <Text style={{ color: '#0a0', fontSize: 16 }}>← Back</Text>
                  </TouchableOpacity>
                ),
              })}
            />
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
            <Stack.Screen name="Celebration"  component={CelebrationScreen} />
            <Stack.Screen name="Certificate"  component={CertificateScreen} />
            <Stack.Screen name="Recognition"  component={RecognitionScreen} />
            <Stack.Screen name="BraceletForm" component={BraceletFormScreen} />
            <Stack.Screen name="BraceletPayment" component={BraceletPaymentScreen} />
            <Stack.Screen name="RecognitionAdmin" component={RecognitionAdminScreen} />
            <Stack.Screen name="Family">
              {(props) => <FamilyScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="Feedback"  component={FeedbackScreen} />
            <Stack.Screen name="Help">
              {(props) => <HelpScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="Donation"  component={DonationScreen} />
            <Stack.Screen name="Legal"     component={LegalScreen} />
            <Stack.Screen name="SearchActs">
              {(props) => <SearchActsScreen {...props} user={user} />}
            </Stack.Screen>
            <Stack.Screen name="Tour">
              {(props) => <OnboardingScreen onDone={() => props.navigation.navigate('Main', { screen: 'Home' })} />}
            </Stack.Screen>
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
                      props.navigation.navigate('Mission', { loginData: data });
                    }}
                  />
                );
              }}
            </Stack.Screen>

            <Stack.Screen name="Mission">
              {(props) => (
                <OnboardingScreen
                  onDone={() => {
                    const data = props.route?.params?.loginData || pendingLoginData;
                    if (data) {
                      onLogin(data);
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
