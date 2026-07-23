import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastHostComponent } from './componentes/toast-host.component';

@Component({
  selector: 'admin-root',
  imports: [RouterOutlet, ToastHostComponent],
  template: '<router-outlet /><admin-toast-host />',
})
export class App {}
