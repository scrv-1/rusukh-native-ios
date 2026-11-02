import React from 'react';
import { View } from 'react-native';
import { Button, Label, light } from './ui';

/** Recovers render failures without wiping the student's local store. */
export class RecoveryBoundary extends React.Component<{children:React.ReactNode},{failed:boolean;generation:number}> {
  state={failed:false,generation:0};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if (this.state.failed) return <View style={{flex:1,padding:28,gap:18,justifyContent:'center',backgroundColor:light.bg}}>
      <Label p={light} size={24} weight="800">تعذّر عرض هذه الشاشة</Label>
      <Label p={light}>أعد فتح مساحة الدراسة. لن نحذف ملاحظاتك أو نعيد ضبط بياناتك.</Label>
      <Button p={light} title="إعادة فتح رُسوخ" onPress={()=>this.setState(s=>({failed:false,generation:s.generation+1}))} />
    </View>;
    return <React.Fragment key={this.state.generation}>{this.props.children}</React.Fragment>;
  }
}
