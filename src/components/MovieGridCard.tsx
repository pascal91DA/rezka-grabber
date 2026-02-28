import React from 'react';
import {Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Movie} from '../types/Movie';
import {RootStackParamList} from '../types/navigation';

const H_PADDING = 8;
const GAP = 6;

interface Props {
  movie: Movie;
  numColumns: number;
}

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const MovieGridCard: React.FC<Props> = ({movie, numColumns}) => {
  const navigation = useNavigation<NavProp>();
  const {width} = useWindowDimensions();
  const cardWidth = (width - H_PADDING * 2 - GAP * (numColumns - 1)) / numColumns;
  const posterHeight = Math.round(cardWidth * 1.5);

  return (
    <TouchableOpacity
      style={[styles.card, {width: cardWidth}]}
      onPress={() => navigation.navigate('Player', {movie})}
      activeOpacity={0.75}
    >
      {/* Постер */}
      <View style={[styles.posterWrapper, {height: posterHeight}]}>
        {movie.poster ? (
          <Image
            source={{uri: movie.poster}}
            style={styles.poster}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.posterPlaceholder}>
            <Text style={styles.posterPlaceholderText}>🎬</Text>
          </View>
        )}
        {movie.contentType && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{movie.contentType}</Text>
          </View>
        )}
        {movie.rating && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>★ {movie.rating}</Text>
          </View>
        )}
      </View>

      {/* Подпись */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{movie.title}</Text>
        {movie.description
          ? <Text style={styles.description} numberOfLines={2}>{movie.description}</Text>
          : movie.year
            ? <Text style={styles.year}>{movie.year}</Text>
            : null
        }
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: GAP,
  },
  posterWrapper: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
  },
  posterPlaceholderText: {
    fontSize: 28,
  },
  typeBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,122,255,0.85)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  typeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  ratingText: {
    color: '#ffa500',
    fontSize: 10,
    fontWeight: '700',
  },
  info: {
    paddingTop: 4,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  title: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
  year: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
  },
  description: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
    lineHeight: 13,
  },
});
