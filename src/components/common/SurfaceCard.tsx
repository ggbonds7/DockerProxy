import React from 'react';
import CardComponent from 'antd/es/card';
import type { CardProps } from 'antd';

export function SurfaceCard(props: CardProps) {
  return React.createElement(CardComponent as React.ComponentType<CardProps>, props);
}
