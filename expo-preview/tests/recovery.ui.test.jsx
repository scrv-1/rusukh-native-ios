import React from 'react';
import {Text} from 'react-native';
import {render,screen,fireEvent} from '@testing-library/react-native';
import {RecoveryBoundary} from '../src/RecoveryBoundary';
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
test('render failure retries a fresh screen without a data-reset action',async()=>{
 let broken=true; const original=console.error; console.error=jest.fn();
 function Child(){if(broken)throw new Error('render failure');return <Text>الدراسة متاحة</Text>;}
 try {
  await render(<RecoveryBoundary><Child/></RecoveryBoundary>);
  expect(screen.getByText('تعذّر عرض هذه الشاشة')).toBeTruthy();
  broken=false;
  await fireEvent.press(screen.getByRole('button',{name:'إعادة فتح رُسوخ'}));
  expect(screen.getByText('الدراسة متاحة')).toBeTruthy();
 } finally {console.error=original;}
});
