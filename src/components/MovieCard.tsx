import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Movie } from '../types/Movie';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { HistoryService } from '../services/historyService';

interface MovieCardProps {
  movie: Movie;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const MovieCard: React.FC<MovieCardProps> = ({ movie }) => {
  const navigation = useNavigation<NavigationProp>();

  const handlePress = async () => {
    // Сохраняем фильм в историю перед открытием
    await HistoryService.addToHistory(movie);

    navigation.navigate('Player', { movie });
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>
        {movie.originalTitle && (
          <Text style={styles.originalTitle} numberOfLines={1}>
            {movie.originalTitle}
          </Text>
        )}
        <View style={styles.metadata}>
          {movie.year && (
            <Text style={styles.year}>{movie.year}</Text>
          )}
          {movie.rating && (
            <Text style={styles.rating}>★ {movie.rating}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  originalTitle: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 4,
    fontStyle: 'italic',
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  year: {
    fontSize: 12,
    color: '#888',
    marginRight: 8,
  },
  rating: {
    fontSize: 12,
    color: '#ffa500',
    fontWeight: '600',
  },
});
