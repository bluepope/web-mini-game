import {test,expect} from '@playwright/test';

test('a pasted invitation joins the room and invalid links are rejected',async({browser})=> {
  const host=await browser.newPage(),guest=await browser.newPage();
  try {
    await host.goto('/');await expect(host.locator('#create')).toBeEnabled();
    await host.locator('#name').fill('방장');await host.locator('#create').click();
    await expect(host.locator('#invite-url')).toContainText('?room=');const link=await host.locator('#invite-url').innerText();
    await guest.goto('/');await expect(guest.locator('#join')).toBeEnabled();await guest.locator('#name').fill('손님');
    await guest.locator('#invite-link').fill('javascript:alert(1)');await guest.locator('#join').click();
    await expect(guest.locator('#toast')).toHaveText('올바른 초대 링크를 입력해 주세요.');await expect(guest.locator('#entry')).toBeVisible();
    await guest.locator('#invite-link').fill(link);await guest.locator('#join').click();
    await expect(host.locator('#players li')).toHaveCount(2);await expect(guest.locator('#room')).toBeVisible();
    expect(await guest.locator('#invite-url').innerText()).toBe(link);
  } finally {await host.close();await guest.close();}
});
